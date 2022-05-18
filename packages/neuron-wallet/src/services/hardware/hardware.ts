// eslint-disable-next-line prettier/prettier
import type Transaction from 'models/chain/transaction'
import type { DeviceInfo, ExtendedPublicKey, PublicKey } from './common'
import { AccountExtendedPublicKey } from 'models/keys/key'

export abstract class Hardware {
  public deviceInfo: DeviceInfo
  public isConnected: boolean
  protected defaultPath = AccountExtendedPublicKey.ckbAccountPath

  constructor(device: DeviceInfo) {
    this.deviceInfo = device
    this.isConnected = false
  }

  public abstract getPublicKey(path: string): Promise<PublicKey>
  public abstract getExtendedPublicKey(): Promise<ExtendedPublicKey>
  public abstract connect(hardwareInfo?: DeviceInfo): Promise<void>
  public abstract signMessage(path: string, messageHex: string): Promise<string>
  public abstract disconnect(): Promise<void>
  public abstract getAppVersion(): Promise<string>
  public abstract getFirmwareVersion?(): Promise<string>
  public abstract signTransaction(
    walletID: string,
    tx: Transaction,
    witnesses: string[],
    path: string,
    context?: RPC.RawTransaction[]
  ): Promise<string>
}

export type HardwareClass = new (device: DeviceInfo) => Hardware
