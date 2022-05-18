import WalletService, { Wallet } from 'services/wallets'
import NodeService from './node'
import { scriptToAddress, serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils'
import { MultisigOption } from '@nervosnetwork/ckb-sdk-core/lib/signWitnesses'
import { SignatureProvider } from '@nervosnetwork/ckb-sdk-core/lib/signWitnessGroup'
import { TransactionPersistor, TransactionGenerator, TargetOutput } from './tx'
import AddressService from './addresses'
import { Address } from 'models/address'
import { PathAndPrivateKey } from 'models/keys/key'
import { CellIsNotYetLive, TransactionIsNotCommittedYet } from 'exceptions/dao'
import FeeMode from 'models/fee-mode'
import TransactionSize from 'models/transaction-size'
import TransactionFee from 'models/transaction-fee'
import logger from 'utils/logger'
import Keychain from 'models/keys/keychain'
import Input from 'models/chain/input'
import OutPoint from 'models/chain/out-point'
import Output from 'models/chain/output'
import RpcService from 'services/rpc-service'
import WitnessArgs from 'models/chain/witness-args'
import Transaction from 'models/chain/transaction'
import BlockHeader from 'models/chain/block-header'
import Script from 'models/chain/script'
import Multisig from 'models/multisig'
import SystemScriptInfo from 'models/system-script-info'
import AddressParser from 'models/address-parser'
import HardwareWalletService from './hardware'
import {
  CapacityNotEnoughForChange,
  CapacityNotEnoughForChangeByTransfer,
  MultisigConfigNeedError,
  NoMatchAddressForSign
} from 'exceptions'
import AssetAccountInfo from 'models/asset-account-info'
import MultisigConfigModel from 'models/multisig-config'
import { Hardware } from './hardware/hardware'
import MultisigService from './multisig'
import NetworksService from './networks'

export default class TransactionSender {
  static MULTI_SIGN_ARGS_LENGTH = 58

  private walletService: WalletService

  constructor() {
    this.walletService = WalletService.getInstance()
  }

  public async sendTx(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    skipLastInputs: boolean = true,
    skipSign = false
  ) {
    const tx = skipSign
      ? Transaction.fromObject(transaction)
      : await this.sign(walletID, transaction, password, skipLastInputs)

    return this.broadcastTx(walletID, tx)
  }

  public async sendMultisigTx(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    multisigConfigs: MultisigConfigModel[],
    skipSign = false
  ) {
    const tx = skipSign
      ? Transaction.fromObject(transaction)
      : await this.signMultisig(walletID, transaction, password, multisigConfigs)

    return this.broadcastTx(walletID, tx)
  }

  public async broadcastTx(walletID: string = '', tx: Transaction) {
    const { ckb } = NodeService.getInstance()
    await ckb.rpc.sendTransaction(tx.toSDKRawTransaction(), 'passthrough')
    const txHash = tx.hash!

    await TransactionPersistor.saveSentTx(tx, txHash)
    await MultisigService.saveSentMultisigOutput(tx)

    const wallet = WalletService.getInstance().get(walletID)
    await wallet.checkAndGenerateAddresses()
    return txHash
  }

  public async sign(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    skipLastInputs: boolean = true,
    context?: RPC.RawTransaction[]
  ) {
    const wallet = this.walletService.get(walletID)
    const tx = Transaction.fromObject(transaction)
    const { ckb } = NodeService.getInstance()
    const txHash: string = tx.computeHash()
    let device: Hardware | undefined
    let pathAndPrivateKeys: PathAndPrivateKey[] | undefined
    const addressInfos = (await this.getAddressInfos(walletID)).map(i => {
      return {
        multisigLockArgs: Multisig.hash([i.blake160]),
        ...i
      }
    })
    const paths = addressInfos.map(info => info.path)
    if (wallet.isHardware()) {
      device = HardwareWalletService.getInstance().getCurrent()
      if (!device) {
        const wallet = WalletService.getInstance().getCurrent()
        const deviceInfo = wallet!.getDeviceInfo()
        device = await HardwareWalletService.getInstance().initHardware(deviceInfo)
        await device.connect()
      }
    } else {
      pathAndPrivateKeys = this.getPrivateKeys(wallet, paths, password) || []
    }

    // Only one multi sign input now.
    const isMultiSign =
      tx.inputs.length === 1 && tx.inputs[0].lock!.args.length === TransactionSender.MULTI_SIGN_ARGS_LENGTH

    const signInputs = tx.inputs.slice(0, skipLastInputs ? -1 : tx.inputs.length)
    const witnessBeforeSign = this.getWitnessForSign(signInputs, tx.witnesses)
    const lockHashes = new Set(signInputs.map(v => v.lockHash!))

    const signKeyMap: Map<string, SignatureProvider | MultisigOption> = new Map()
    for (const lockHash of lockHashes) {
      const lockArgs = tx.inputs.find(v => v.lockHash === lockHash)!.lock?.args!
      const [privateKey, blake160] = this.findPrivateKey([lockArgs], addressInfos, pathAndPrivateKeys)
      let sk: SignatureProvider = privateKey!
      if (wallet.isHardware()) {
        sk = async (_: string, witnesses) => {
          const res = await device!.signTransaction(
            walletID,
            tx,
            witnesses.map(w => (typeof w === 'string' ? w : serializeWitnessArgs(w))),
            privateKey!,
            context
          )
          return `0x${res}`
        }
      }
      if (isMultiSign) {
        signKeyMap.set(lockHash, {
          sk,
          blake160: blake160!,
          // 带时间锁默认多签为 0/1/1
          config: {
            r: 0,
            m: 1,
            n: 1,
            blake160s: [blake160!]
          },
          signatures: []
        })
      } else {
        signKeyMap.set(lockHash, sk)
      }
    }

    const witnesses = await ckb.signWitnesses(signKeyMap)({
      transactionHash: txHash,
      witnesses: witnessBeforeSign,
      inputCells: tx.inputs.map(v => ({ lock: v.lock! })),
      skipMissingKeys: false
    })
    tx.witnesses = witnesses.map(v => v as string)
    tx.hash = txHash

    return tx
  }

  public async signMultisig(
    walletID: string = '',
    transaction: Transaction,
    password: string = '',
    multisigConfigs: MultisigConfigModel[],
    context?: RPC.RawTransaction[]
  ) {
    const wallet = this.walletService.get(walletID)
    const tx = Transaction.fromObject(transaction)
    const txHash: string = tx.computeHash()
    const addressInfos = await this.getAddressInfos(walletID)
    const paths = addressInfos.map(info => info.path)
    let device: Hardware | undefined
    let pathAndPrivateKeys: PathAndPrivateKey[] | undefined
    if (wallet.isHardware()) {
      device = HardwareWalletService.getInstance().getCurrent()
      if (!device) {
        const wallet = WalletService.getInstance().getCurrent()
        const deviceInfo = wallet!.getDeviceInfo()
        device = await HardwareWalletService.getInstance().initHardware(deviceInfo)
        await device.connect()
      }
    } else {
      pathAndPrivateKeys = this.getPrivateKeys(wallet, paths, password)
    }
    const lockHashes = new Set(tx.inputs.map(w => w.lockHash!))
    const multisigConfigMap: Record<string, MultisigConfigModel> = multisigConfigs.reduce(
      (pre, cur) => ({
        ...pre,
        [cur.getLockHash()]: cur
      }),
      {}
    )
    const signKeyMap: Map<string, string | MultisigOption> = new Map()
    for (const lockHash of lockHashes) {
      const multisigConfig = multisigConfigMap[lockHash]
      if (!multisigConfig) {
        throw new MultisigConfigNeedError()
      }
      const [privateKey, blake160] = this.findPrivateKey(
        multisigConfig.blake160s,
        addressInfos,
        pathAndPrivateKeys,
        tx.signatures?.[lockHash]
      )
      let sk: SignatureProvider = privateKey!
      if (wallet.isHardware()) {
        sk = async (_: string, witnesses) => {
          const res = await device!.signTransaction(
            walletID,
            tx,
            witnesses.map(w => (typeof w === 'string' ? w : serializeWitnessArgs(w))),
            privateKey!,
            context
          )
          return `0x${res}`
        }
      }
      signKeyMap.set(lockHash, {
        sk,
        blake160: blake160!,
        config: {
          r: multisigConfig.r,
          m: multisigConfig.m,
          n: multisigConfig.n,
          blake160s: multisigConfig.blake160s
        },
        signatures: tx.signatures?.[lockHash] || []
      })
      tx.setSignatures(lockHash, blake160!)
    }
    const { ckb } = NodeService.getInstance()
    const witnessBeforeSign = this.getWitnessForSign(tx.inputs, tx.witnesses)
    const witnesses = await ckb.signWitnesses(signKeyMap)({
      transactionHash: txHash,
      witnesses: witnessBeforeSign,
      inputCells: tx.inputs.map(v => ({ lock: v.lock! })),
      skipMissingKeys: false
    })
    tx.witnesses = witnesses.map(v => (typeof v === 'string' ? v : WitnessArgs.fromObject(v)))
    tx.hash = txHash

    return tx
  }

  public generateTx = async (
    walletID: string = '',
    items: TargetOutput[] = [],
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString()
    }))

    const changeAddress: string = await this.getChangeAddress()

    try {
      const tx: Transaction = await TransactionGenerator.generateTx(
        walletID,
        targetOutputs,
        changeAddress,
        fee,
        feeRate
      )

      return tx
    } catch (error) {
      if (error instanceof CapacityNotEnoughForChange) {
        throw new CapacityNotEnoughForChangeByTransfer()
      }
      throw error
    }
  }

  public generateSendingAllTx = async (
    walletID: string = '',
    items: TargetOutput[] = [],
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString()
    }))

    const tx: Transaction = await TransactionGenerator.generateSendingAllTx(walletID, targetOutputs, fee, feeRate)

    return tx
  }

  public generateMultisigSendAllTx = async (
    items: TargetOutput[] = [],
    multisigConfig: MultisigConfigModel
  ): Promise<Transaction> => {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString()
    }))

    const tx: Transaction = await TransactionGenerator.generateSendingAllTx(
      '',
      targetOutputs,
      '0',
      '1000',
      multisigConfig
    )

    return tx
  }

  public async generateMultisigTx(
    items: TargetOutput[] = [],
    multisigConfig: MultisigConfigModel
  ): Promise<Transaction> {
    const targetOutputs = items.map(item => ({
      ...item,
      capacity: BigInt(item.capacity).toString()
    }))

    try {
      const lockScript = Multisig.getMultisigScript(
        multisigConfig.blake160s,
        multisigConfig.r,
        multisigConfig.m,
        multisigConfig.n
      )
      const multisigAddresses = scriptToAddress(lockScript, NetworksService.getInstance().isMainnet())
      const tx: Transaction = await TransactionGenerator.generateTx(
        '',
        targetOutputs,
        multisigAddresses,
        '0',
        '1000',
        {
          lockArgs: [lockScript.args],
          codeHash: SystemScriptInfo.MULTI_SIGN_CODE_HASH,
          hashType: SystemScriptInfo.MULTI_SIGN_HASH_TYPE
        },
        multisigConfig
      )
      return tx
    } catch (error) {
      if (error instanceof CapacityNotEnoughForChange) {
        throw new CapacityNotEnoughForChangeByTransfer()
      }
      throw error
    }
  }

  public generateTransferNftTx = async (
    walletId: string,
    outPoint: OutPoint,
    receiveAddress: string,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const changeAddress: string = await this.getChangeAddress()
    const url: string = NodeService.getInstance().ckb.node.url
    const rpcService = new RpcService(url)
    // for some reason with data won't work
    const cellWithStatus = await rpcService.getLiveCell(new OutPoint(outPoint.txHash, outPoint.index), true)
    const prevOutput = cellWithStatus.cell!.output
    if (!cellWithStatus.isLive()) {
      throw new CellIsNotYetLive()
    }

    const tx = await TransactionGenerator.generateTransferNftTx(
      walletId,
      outPoint,
      prevOutput,
      receiveAddress,
      changeAddress,
      fee,
      feeRate
    )

    return tx
  }

  public generateDepositTx = async (
    walletID: string = '',
    capacity: string,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const wallet = WalletService.getInstance().get(walletID)

    const address = await wallet.getNextAddress()

    const changeAddress: string = await this.getChangeAddress()

    const tx = await TransactionGenerator.generateDepositTx(
      walletID,
      capacity,
      address!.address,
      changeAddress,
      fee,
      feeRate
    )

    return tx
  }

  public startWithdrawFromDao = async (
    walletID: string,
    outPoint: OutPoint,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    // only for check wallet exists
    this.walletService.get(walletID)

    const url: string = NodeService.getInstance().ckb.node.url
    const rpcService = new RpcService(url)
    const cellWithStatus = await rpcService.getLiveCell(outPoint, false)
    if (!cellWithStatus.isLive()) {
      throw new CellIsNotYetLive()
    }
    const prevTx = await rpcService.getTransaction(outPoint.txHash)
    if (!prevTx || !prevTx.txStatus.isCommitted()) {
      throw new TransactionIsNotCommittedYet()
    }

    const depositBlockHeader = await rpcService.getHeader(prevTx.txStatus.blockHash!)

    const wallet = WalletService.getInstance().get(walletID)
    const changeAddress = await wallet.getNextChangeAddress()
    const prevOutput = cellWithStatus.cell!.output
    const tx: Transaction = await TransactionGenerator.startWithdrawFromDao(
      walletID,
      outPoint,
      prevOutput,
      depositBlockHeader!.number,
      depositBlockHeader!.hash,
      changeAddress!.address,
      fee,
      feeRate
    )

    return tx
  }

  public withdrawFromDao = async (
    walletID: string,
    depositOutPoint: OutPoint,
    withdrawingOutPoint: OutPoint,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const DAO_LOCK_PERIOD_EPOCHS = BigInt(180)

    const feeInt = BigInt(fee)
    const feeRateInt = BigInt(feeRate)
    const mode = new FeeMode(feeRateInt)

    const url: string = NodeService.getInstance().ckb.node.url
    const rpcService = new RpcService(url)

    const cellStatus = await rpcService.getLiveCell(withdrawingOutPoint, true)
    if (!cellStatus.isLive()) {
      throw new CellIsNotYetLive()
    }
    const prevTx = (await rpcService.getTransaction(withdrawingOutPoint.txHash))!
    if (!prevTx.txStatus.isCommitted()) {
      throw new TransactionIsNotCommittedYet()
    }

    const secpCellDep = await SystemScriptInfo.getInstance().getSecpCellDep()
    const daoCellDep = await SystemScriptInfo.getInstance().getDaoCellDep()

    const content = cellStatus.cell!.data!.content
    const buf = Buffer.from(content.slice(2), 'hex')
    const depositBlockNumber: bigint = buf.readBigUInt64LE()
    const depositBlockHeader: BlockHeader = (await rpcService.getHeaderByNumber(depositBlockNumber.toString()))!
    const depositEpoch = this.parseEpoch(BigInt(depositBlockHeader.epoch))
    const depositCapacity: bigint = BigInt(cellStatus.cell!.output.capacity)

    const withdrawBlockHeader = (await rpcService.getHeader(prevTx.txStatus.blockHash!))!
    const withdrawEpoch = this.parseEpoch(BigInt(withdrawBlockHeader.epoch))

    const withdrawFraction = withdrawEpoch.index * depositEpoch.length
    const depositFraction = depositEpoch.index * withdrawEpoch.length
    let depositedEpoches = withdrawEpoch.number - depositEpoch.number
    if (withdrawFraction > depositFraction) {
      depositedEpoches += BigInt(1)
    }
    const lockEpoches =
      ((depositedEpoches + (DAO_LOCK_PERIOD_EPOCHS - BigInt(1))) / DAO_LOCK_PERIOD_EPOCHS) * DAO_LOCK_PERIOD_EPOCHS
    const minimalSinceEpochNumber = depositEpoch.number + lockEpoches
    const minimalSinceEpochIndex = depositEpoch.index
    const minimalSinceEpochLength = depositEpoch.length

    const minimalSince = this.epochSince(minimalSinceEpochLength, minimalSinceEpochIndex, minimalSinceEpochNumber)

    const outputCapacity: bigint = await this.calculateDaoMaximumWithdraw(depositOutPoint, withdrawBlockHeader.hash)

    const wallet = WalletService.getInstance().get(walletID)
    const address = await wallet.getNextAddress()
    const blake160 = AddressParser.toBlake160(address!.address)

    const output: Output = new Output(
      outputCapacity.toString(),
      new Script(SystemScriptInfo.SECP_CODE_HASH, blake160, SystemScriptInfo.SECP_HASH_TYPE),
      undefined,
      '0x'
    )

    const outputs: Output[] = [output]

    const previousOutput = cellStatus.cell!.output
    const input: Input = new Input(
      withdrawingOutPoint,
      minimalSince.toString(),
      previousOutput.capacity,
      previousOutput.lock
    )

    const withdrawWitnessArgs: WitnessArgs = new WitnessArgs(WitnessArgs.EMPTY_LOCK, '0x0000000000000000')
    const tx: Transaction = Transaction.fromObject({
      version: '0',
      cellDeps: [secpCellDep, daoCellDep],
      headerDeps: [depositBlockHeader.hash, withdrawBlockHeader.hash],
      inputs: [input],
      outputs,
      outputsData: outputs.map(o => o.data || '0x'),
      witnesses: [withdrawWitnessArgs],
      interest: (BigInt(outputCapacity) - depositCapacity).toString()
    })
    if (mode.isFeeRateMode()) {
      const txSize: number = TransactionSize.tx(tx)
      const txFee: bigint = TransactionFee.fee(txSize, BigInt(feeRate))
      tx.fee = txFee.toString()
      tx.outputs[0].capacity = (outputCapacity - txFee).toString()
    } else {
      tx.fee = fee
      tx.outputs[0].capacity = (outputCapacity - feeInt).toString()
    }

    logger.debug('withdrawFromDao fee:', tx.fee)

    return tx
  }

  public generateDepositAllTx = async (
    walletID: string = '',
    isBalanceReserved = true,
    fee: string = '0',
    feeRate: string = '0'
  ): Promise<Transaction> => {
    const wallet = WalletService.getInstance().get(walletID)
    const receiveAddress = await wallet.getNextAddress()
    const changeAddress = await wallet.getNextChangeAddress()

    const tx = await TransactionGenerator.generateDepositAllTx(
      walletID,
      receiveAddress!.address,
      changeAddress!.address,
      isBalanceReserved,
      fee,
      feeRate
    )

    return tx
  }

  public async generateWithdrawMultiSignTx(
    walletID: string,
    outPoint: OutPoint,
    fee: string = '0',
    feeRate: string = '0'
  ) {
    // only for check wallet exists
    this.walletService.get(walletID)

    const url: string = NodeService.getInstance().ckb.node.url
    const rpcService = new RpcService(url)
    const cellWithStatus = await rpcService.getLiveCell(outPoint, false)
    if (!cellWithStatus.isLive()) {
      throw new CellIsNotYetLive()
    }
    const prevTx = await rpcService.getTransaction(outPoint.txHash)
    if (!prevTx || !prevTx.txStatus.isCommitted()) {
      throw new TransactionIsNotCommittedYet()
    }

    const wallet = WalletService.getInstance().get(walletID)
    const receivingAddressInfo = await wallet.getNextAddress()

    const receivingAddress = receivingAddressInfo!.address
    const prevOutput = cellWithStatus.cell!.output
    const tx: Transaction = await TransactionGenerator.generateWithdrawMultiSignTx(
      outPoint,
      prevOutput,
      receivingAddress,
      fee,
      feeRate
    )

    return tx
  }

  public calculateDaoMaximumWithdraw = async (
    depositOutPoint: OutPoint,
    withdrawBlockHash: string
  ): Promise<bigint> => {
    const { ckb } = NodeService.getInstance()
    const result = await ckb.calculateDaoMaximumWithdraw(depositOutPoint.toSDK(), withdrawBlockHash)

    return BigInt(result)
  }

  private parseEpoch = (epoch: bigint) => {
    return {
      length: (epoch >> BigInt(40)) & BigInt(0xffff),
      index: (epoch >> BigInt(24)) & BigInt(0xffff),
      number: epoch & BigInt(0xffffff)
    }
  }

  private epochSince = (length: bigint, index: bigint, number: bigint) => {
    return (BigInt(0x20) << BigInt(56)) + (length << BigInt(40)) + (index << BigInt(24)) + number
  }

  // path is a BIP44 full path such as "m/44'/309'/0'/0/0"
  public getAddressInfos = (walletID: string): Promise<Address[]> => {
    // only for check wallet exists
    this.walletService.get(walletID)
    return AddressService.getAddressesByWalletId(walletID)
  }

  public getChangeAddress = async (): Promise<string> => {
    const wallet = this.walletService.getCurrent()

    const unusedChangeAddress = await wallet!.getNextChangeAddress()

    return unusedChangeAddress!.address
  }

  // Derive all child private keys for specified BIP44 paths.
  public getPrivateKeys = (wallet: Wallet, paths: string[], password: string): PathAndPrivateKey[] => {
    const masterPrivateKey = wallet.loadKeystore().extendedPrivateKey(password)
    const masterKeychain = new Keychain(
      Buffer.from(masterPrivateKey.privateKey, 'hex'),
      Buffer.from(masterPrivateKey.chainCode, 'hex')
    )

    const uniquePaths = paths.filter((value, idx, a) => a.indexOf(value) === idx)
    return uniquePaths.map(path => ({
      path,
      privateKey: `0x${masterKeychain.derivePath(path).privateKey.toString('hex')}`
    }))
  }

  private findPrivateKey(
    argsList: string[],
    addressInfos: (Address & { multisigLockArgs?: string })[],
    pathAndPrivateKeys?: PathAndPrivateKey[],
    signedBlake160s?: string[]
  ) {
    let addressInfo: { path: string; blake160: string } | undefined | null
    argsList.some(args => {
      if (signedBlake160s?.includes(args)) {
        return false
      }
      if (args.length === TransactionSender.MULTI_SIGN_ARGS_LENGTH) {
        addressInfo = addressInfos.find(i => args.slice(0, 42) === i.multisigLockArgs)
      } else if (args.length === 42) {
        addressInfo = addressInfos.find(i => i.blake160 === args)
      } else {
        addressInfo = AssetAccountInfo.findSignPathForCheque(addressInfos, args)
      }
      return !!addressInfo
    })
    if (!addressInfo) {
      throw new NoMatchAddressForSign()
    }
    if (!pathAndPrivateKeys) {
      // if is hardwallet sign, no need to find private key
      return [addressInfo.path, addressInfo.blake160]
    }
    const pathAndPrivateKey = pathAndPrivateKeys.find(p => p.path === addressInfo!.path)
    if (!pathAndPrivateKey) {
      throw new Error('no private key found')
    }
    return [pathAndPrivateKey.privateKey, addressInfo.blake160]
  }

  private getWitnessForSign(inputs: Input[], witnesses: (WitnessArgs | string)[]) {
    const groupFirstRecord: Set<string> = new Set()
    return inputs.map((input: Input, idx: number) => {
      const wit = witnesses[idx]
      const witnessArgs = wit instanceof WitnessArgs ? wit : WitnessArgs.generateEmpty()
      if (!groupFirstRecord.has(input.lockHash!)) {
        // if first witness
        groupFirstRecord.add(input.lockHash!)
        return witnessArgs.toSDK()
      } else if (
        witnessArgs.lock === undefined &&
        witnessArgs.inputType === undefined &&
        witnessArgs.outputType === undefined
      ) {
        return '0x'
      }
      return serializeWitnessArgs(witnessArgs.toSDK())
    })
  }
}
