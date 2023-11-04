import { BrowserWindow, nativeTheme } from 'electron'
import env from '../env'
import Store from '../models/store'
import { changeLanguage } from '../locales/i18n'
import { updateApplicationMenu } from '../controllers/app/menu'
import path from 'path'
import NetworksService from './networks'
import { LIGHT_CLIENT_MAINNET, LIGHT_CLIENT_TESTNET } from '../utils/const'

const { app } = env

export const locales = ['zh', 'zh-TW', 'en', 'en-US'] as const
export type Locale = (typeof locales)[number]
const settingKeys = {
  ckbDataPath: 'ckbDataPath',
  nodeDataPath: 'nodeDataPath',
}

export default class SettingsService extends Store {
  private static instance: SettingsService | null = null

  public static getInstance() {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService()
    }
    return SettingsService.instance
  }

  get locale() {
    const res = this.readSync<string>('locale')
    if (locales.includes(res as Locale)) {
      return res as Locale
    }
    return res?.startsWith('zh') ? 'zh' : 'en'
  }

  set locale(lng: Locale) {
    if (locales.includes(lng)) {
      this.writeSync('locale', lng)
      changeLanguage(lng)
      this.onLocaleChanged(lng)
    } else {
      throw new Error(`Locale ${lng} not supported`)
    }
  }

  get indexerDataPath(): string {
    return this.readSync('indexerDataPath')
  }

  set indexerDataPath(dataPath: string) {
    this.writeSync('indexerDataPath', dataPath)
  }

  getNodeDataPath(chain?: string) {
    return this.readSync<string>(
      `${settingKeys.nodeDataPath}_${chain ?? NetworksService.getInstance().getCurrent().chain}`
    )
  }

  setNodeDataPath(dataPath: string, chain?: string) {
    this.writeSync(`${settingKeys.nodeDataPath}_${chain ?? NetworksService.getInstance().getCurrent().chain}`, dataPath)
  }

  get themeSource() {
    return this.readSync('themeSource') || 'system'
  }

  set themeSource(theme: 'system' | 'light' | 'dark') {
    nativeTheme.themeSource = theme
    this.writeSync('themeSource', theme)
  }

  constructor() {
    super(
      '',
      'settings.json',
      JSON.stringify({
        locale: app.getLocale(),
        ckbDataPath: path.resolve(app.getPath('userData'), 'chains/mainnet'),
      })
    )
    if (!this.getNodeDataPath(LIGHT_CLIENT_MAINNET)) {
      this.migrateDataPath()
    }
  }

  private onLocaleChanged = (lng: Locale) => {
    BrowserWindow.getAllWindows().forEach(bw => bw.webContents.send('set-locale', lng))
    updateApplicationMenu(null)
  }

  migrateDataPath() {
    const networkChain = NetworksService.getInstance().getCurrent()?.chain
    const currentCkbDataPath = this.readSync(settingKeys.ckbDataPath)
    this.writeSync(`${settingKeys.nodeDataPath}_${networkChain}`, currentCkbDataPath)
    const defaultMainNetworkDir = path.resolve(app.getPath('userData'), 'chains/mainnet')
    if (networkChain === 'ckb') {
      this.writeSync(`${settingKeys.nodeDataPath}_ckb_testnet`, path.resolve(app.getPath('userData'), 'chains/testnet'))
    } else {
      // if user has changed the ckb data path and running with testnet
      this.writeSync(`${settingKeys.nodeDataPath}_ckb`, defaultMainNetworkDir)
    }
    this.writeSync(
      `${settingKeys.nodeDataPath}_${LIGHT_CLIENT_TESTNET}`,
      path.resolve(app.getPath('userData'), 'chains/light/testnet')
    )
    this.writeSync(
      `${settingKeys.nodeDataPath}_${LIGHT_CLIENT_MAINNET}`,
      path.resolve(app.getPath('userData'), 'chains/light/mainnet')
    )
  }
}
