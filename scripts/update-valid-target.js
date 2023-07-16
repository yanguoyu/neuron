const { request } = require('undici')
const fs = require('node:fs')
const path = require('node:path')

async function rpcRequest(method, params = []) {
  const res = await request('https://mainnet.ckb.dev/rpc', {
    method: 'POST',
    body: JSON.stringify({
      id: 0,
      jsonrpc: '2.0',
      method,
      params,
    }),
    headers: {
      'content-type': 'application/json',
    },
  })
  const body = await res.body.json()
  return body?.result
}

const ESTIMATE_BLOCK_COUNT_PER_DAY = 8_000
const envFilePath = path.resolve(__dirname, '../packages/neuron-wallet/.env')
const validTargetReg = /(CKB_NODE_ASSUME_VALID_TARGET=)[\S]*/

;(async function() {
  const tipBlockNumber = await rpcRequest('get_tip_block_number')
  const validTargetBlockNumber = `0x${(BigInt(tipBlockNumber) - BigInt(ESTIMATE_BLOCK_COUNT_PER_DAY)).toString(16)}`
  const blockHash = await rpcRequest('get_block_hash', [validTargetBlockNumber])
  const originEnvContent = fs.readFileSync(envFilePath).toString('utf-8')
  fs.writeFileSync(envFilePath, originEnvContent.replace(validTargetReg, `CKB_NODE_ASSUME_VALID_TARGET='${blockHash}'`))
}())
