export default class MultiSignConfigModel {
  public id?: number
  public walletId: string
  public m: number
  public n: number
  public r: number
  public blake160s: string[]
  public alias?: string
  public fullPayload: string

  constructor(
    walletId: string,
    m: number,
    n: number,
    r: number,
    blake160s: string[],
    fullPayload: string,
    alias?: string,
    id?: number
  ) {
    this.walletId = walletId
    this.m = m
    this.n = n
    this.r = r
    this.blake160s = blake160s
    this.fullPayload = fullPayload
    this.alias = alias
    this.id = id
  }

  public static fromObject(params: {
    walletId: string
    m: number
    n: number
    r: number
    blake160s: string[]
    alias: string
    fullPayload: string
    id?: number
  }): MultiSignConfigModel {
    return new MultiSignConfigModel(
      params.walletId,
      params.m,
      params.n,
      params.r,
      params.blake160s,
      params.fullPayload,
      params.alias,
      params.id
    )
  }

  public toJson() {
    return {
      m: this.m,
      n: this.n,
      r: this.r,
      blake160s: this.blake160s,
      fullPayload: this.fullPayload,
      alias: this.alias
    }
  }
}
