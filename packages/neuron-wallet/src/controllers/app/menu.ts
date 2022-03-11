import fs from 'fs'
import path from 'path'
import { app, shell, BrowserWindow, dialog, MenuItemConstructorOptions, Menu } from 'electron'
import { t } from 'i18next'
import { Subject } from 'rxjs'
import { throttleTime } from 'rxjs/operators'
import env from 'env'
import UpdateController from 'controllers/update'
import ExportDebugController from 'controllers/export-debug'
import { showWindow } from 'controllers/app/show-window'
import WalletsService from 'services/wallets'
import OfflineSignService from 'services/offline-sign'
import CommandSubject from 'models/subjects/command'
import logger from 'utils/logger'
import { SETTINGS_WINDOW_TITLE } from 'utils/const'
import { OfflineSignJSON } from 'models/offline-sign'
import NetworksService from 'services/networks'
import { clearCkbNodeCache } from 'services/ckb-runner'
import IndexerService from 'services/indexer'

enum URL {
  Settings = '/settings/general',
  CreateWallet = '/wizard/mnemonic/create',
  ImportMnemonic = '/wizard/mnemonic/import',
  ImportKeystore = '/keystore/import',
  ImportHardware = '/import-hardware',
  OfflineSign = '/offline-sign'
}

enum ExternalURL {
  Website = 'https://www.nervos.org/',
  Repository = 'https://github.com/nervosnetwork/neuron',
  Issues = 'https://github.com/nervosnetwork/neuron/issues',
  Doc = 'https://docs.nervos.org/docs/basics/tools#neuron-wallet'
}

const separator: MenuItemConstructorOptions = {
  type: 'separator'
}

const showAbout = () => {
  let applicationVersion = t('about.app-version', { name: app.name, version: app.getVersion() })

  const appPath = app.isPackaged ? app.getAppPath() : path.join(__dirname, '../../../../..')
  const ckbVersionPath = path.join(appPath, '.ckb-version')
  if (fs.existsSync(ckbVersionPath)) {
    try {
      const ckbVersion = fs.readFileSync(ckbVersionPath, 'utf8')
      applicationVersion += `\n${t('about.ckb-client-version', { version: ckbVersion })}`
    } catch (err) {
      logger.error(`[Menu]: `, err)
    }
  }

  const isWin = process.platform === 'win32'

  if (isWin) {
    const options = {
      type: 'info',
      title: app.name,
      message: app.name,
      detail: applicationVersion,
      buttons: ['OK'],
      cancelId: 0
    }
    dialog.showMessageBox(options)
    return
  }

  app.setAboutPanelOptions({ applicationVersion, version: '' })
  app.showAboutPanel()
}

const navigateTo = (url: string) => {
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    CommandSubject.next({ winID: window.id, type: 'navigate-to-url', payload: url, dispatchToUI: true })
  }
}

const importHardware = (url: string) => {
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    CommandSubject.next({ winID: window.id, type: 'import-hardware', payload: url, dispatchToUI: true })
  }
}

const loadTransaction = (url: string, json: OfflineSignJSON, filePath: string) => {
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    const payload = JSON.stringify({ url, json, filePath })
    CommandSubject.next({ winID: window.id, type: 'load-transaction-json', payload, dispatchToUI: true })
  }
}

const showSettings$ = new Subject()

showSettings$.pipe(throttleTime(1000)).subscribe(() => {
  showWindow(`#${URL.Settings}`, t(SETTINGS_WINDOW_TITLE))
})

const showSettings = () => {
  showSettings$.next()
}

const requestPassword = (walletID: string, actionType: 'delete-wallet' | 'backup-wallet') => {
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    CommandSubject.next({ winID: window.id, type: actionType, payload: walletID, dispatchToUI: false })
  }
}

const updateApplicationMenu = (mainWindow: BrowserWindow | null) => {
  const isMac = process.platform === 'darwin'
  const currentWindow = BrowserWindow.getFocusedWindow()
  let isMainWindow = mainWindow === currentWindow

  const walletsService = WalletsService.getInstance()
  const isMainnet = new NetworksService().getCurrent().chain === 'ckb'
  const wallets = walletsService.getAll().map(({ id, name }) => ({ id, name }))
  const currentWallet = walletsService.getCurrent()
  const hasCurrentWallet = currentWallet !== undefined
  const isHardwareWallet = currentWallet?.isHardware() ?? false

  const appMenuItem: MenuItemConstructorOptions = {
    id: 'app',
    label: app.name,
    submenu: [
      {
        id: 'about',
        label: t('application-menu.neuron.about', {
          app: app.name
        }),
        click: () => {
          showAbout()
        }
      },
      {
        label: t('application-menu.neuron.check-updates'),
        enabled: isMainWindow && !UpdateController.isChecking,
        click: () => {
          new UpdateController().checkUpdates()
          showSettings()
        }
      },
      separator,
      {
        id: 'preference',
        enabled: isMainWindow,
        label: t('application-menu.neuron.preferences'),
        accelerator: 'CmdOrCtrl+,',
        click: showSettings
      },
      separator,
      {
        label: t('application-menu.neuron.quit', {
          app: app.name
        }),
        role: 'quit'
      }
    ]
  }

  const selectWalletMenu: MenuItemConstructorOptions[] = wallets.map(wallet => {
    return {
      id: wallet.id,
      label: wallet.name,
      type: 'radio',
      checked: currentWallet && wallet.id === currentWallet.id,
      click: () => {
        WalletsService.getInstance().setCurrent(wallet.id)
      }
    }
  })

  const walletMenuItem: MenuItemConstructorOptions = {
    id: 'wallet',
    label: t('application-menu.wallet.label'),
    enabled: isMainWindow,
    submenu: [
      { id: 'select', label: t('application-menu.wallet.select'), submenu: selectWalletMenu },
      {
        id: 'create',
        label: t('application-menu.wallet.create-new'),
        click: () => {
          navigateTo(URL.CreateWallet)
        }
      },
      {
        id: 'import',
        label: t('application-menu.wallet.import'),
        submenu: [
          {
            id: 'import-with-mnemonic',
            label: t('application-menu.wallet.import-mnemonic'),
            click: () => {
              navigateTo(URL.ImportMnemonic)
            }
          },
          {
            id: 'import-with-keystore',
            label: t('application-menu.wallet.import-keystore'),
            click: () => {
              navigateTo(URL.ImportKeystore)
            }
          },
          {
            id: 'import-with-xpubkey',
            label: t('application-menu.wallet.import-xpubkey'),
            click: () => {
              const window = BrowserWindow.getFocusedWindow()
              if (window) {
                CommandSubject.next({ winID: window.id, type: 'import-xpubkey', payload: null, dispatchToUI: false })
              }
            }
          },
          {
            id: 'import-with-hardware',
            label: t('application-menu.wallet.import-hardware'),
            click: () => {
              importHardware(URL.ImportHardware)
            }
          }
        ]
      },
      separator,
      {
        id: 'backup',
        label: t('application-menu.wallet.backup'),
        enabled: hasCurrentWallet && !isHardwareWallet,
        click: () => {
          if (!currentWallet) {
            return
          }
          requestPassword(currentWallet.id, 'backup-wallet')
        }
      },
      {
        id: 'export-xpubkey',
        label: t('application-menu.wallet.export-xpubkey'),
        enabled: hasCurrentWallet && !isHardwareWallet,
        click: () => {
          if (!currentWallet) {
            return
          }
          const window = BrowserWindow.getFocusedWindow()
          if (window) {
            CommandSubject.next({
              winID: window.id,
              type: 'export-xpubkey',
              payload: currentWallet.id,
              dispatchToUI: false
            })
          }
        }
      },
      {
        id: 'delete',
        label: t('application-menu.wallet.delete'),
        enabled: hasCurrentWallet,
        click: () => {
          if (!currentWallet) {
            return
          }
          requestPassword(currentWallet.id, 'delete-wallet')
        }
      }
    ]
  }

  const editMenuItem: MenuItemConstructorOptions = {
    id: 'edit',
    label: t('application-menu.edit.label'),
    submenu: [
      {
        label: t('application-menu.edit.cut'),
        role: 'cut'
      },
      {
        label: t('application-menu.edit.copy'),
        role: 'copy'
      },
      {
        label: t('application-menu.edit.paste'),
        role: 'paste'
      },
      separator,
      {
        label: t('application-menu.edit.selectall'),
        role: 'selectAll'
      }
    ]
  }

  const toolsMenuItem: MenuItemConstructorOptions = {
    id: 'tools',
    label: t('application-menu.tools.label'),
    submenu: [
      {
        label: t('application-menu.tools.sign-and-verify'),
        enabled: hasCurrentWallet,
        click: () => {
          const currentWallet = walletsService.getCurrent()
          showWindow(`#/sign-verify/${currentWallet!.id}`, t(`messageBox.sign-and-verify.title`), {
            width: 900
          })
        }
      },
      {
        label: t('application-menu.tools.create-multisig-address'),
        enabled: hasCurrentWallet,
        click: () => {
          const currentWallet = walletsService.getCurrent()
          showWindow(`#/add-multisigsign-address/${currentWallet!.id}`, t(`messageBox.create-multisig-address.title`), {
            width: 900,
            resizable: true
          })
        }
      },
      {
        label: t('application-menu.tools.clear-sync-data'),
        enabled: hasCurrentWallet && isMainnet,
        click: async () => {
          const res = await dialog.showMessageBox({
            type: 'warning',
            title: t('messageBox.clear-sync-data.title'),
            message: t('messageBox.clear-sync-data.message'),
            buttons: [t('messageBox.button.confirm'), t('messageBox.button.discard')],
            defaultId: 0,
            cancelId: 1
          })
          if (res.response === 0) {
            await clearCkbNodeCache()
            await IndexerService.clearCache(true)
          }
        }
      },
      {
        label: t('application-menu.tools.offline-sign'),
        enabled: hasCurrentWallet,
        click: async () => {
          const result = await OfflineSignService.loadTransactionJSON()
          if (!result) {
            return
          }
          const { json, filePath } = result
          loadTransaction(URL.OfflineSign, json, filePath)
        }
      }
    ]
  }

  const windowMenuItem: MenuItemConstructorOptions = {
    id: 'window',
    label: t('application-menu.window.label'),
    role: 'window',
    submenu: [
      {
        label: t('application-menu.window.minimize'),
        role: 'minimize'
      },
      {
        label: t('application-menu.window.close'),
        role: 'close'
      }
    ]
  }

  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: t('application-menu.help.documentation'),
      click: () => {
        shell.openExternal(ExternalURL.Doc)
      }
    },
    separator,
    {
      label: t('application-menu.help.nervos-website'),
      click: () => {
        shell.openExternal(ExternalURL.Website)
      }
    },
    {
      label: t('application-menu.help.source-code'),
      click: () => {
        shell.openExternal(ExternalURL.Repository)
      }
    },
    {
      label: t('application-menu.help.report-issue'),
      click: () => {
        shell.openExternal(ExternalURL.Issues)
      }
    },
    {
      label: t('application-menu.help.export-debug-info'),
      click: () => {
        new ExportDebugController().export()
      }
    }
  ]
  if (!isMac) {
    helpSubmenu.push(separator)
    helpSubmenu.push({
      id: 'preference',
      label: t(SETTINGS_WINDOW_TITLE),
      click: showSettings
    })
    helpSubmenu.push({
      label: t('application-menu.neuron.check-updates'),
      enabled: isMainWindow && !UpdateController.isChecking,
      click: () => {
        new UpdateController().checkUpdates()
        showSettings()
      }
    })
    helpSubmenu.push({
      id: 'about',
      label: t('application-menu.neuron.about', {
        app: app.name
      }),
      click: () => {
        showAbout()
      }
    })
  }

  const helpMenuItem: MenuItemConstructorOptions = {
    id: 'help',
    label: t('application-menu.help.label'),
    role: 'help',
    submenu: helpSubmenu
  }

  const developMenuItem: MenuItemConstructorOptions = {
    id: 'develop',
    label: t('application-menu.develop.develop'),
    submenu: [
      {
        label: t('application-menu.develop.reload'),
        role: 'reload'
      },
      {
        label: t('application-menu.develop.force-reload'),
        role: 'forceReload'
      },
      {
        label: t('application-menu.develop.toggle-dev-tools'),
        role: 'toggleDevTools'
      }
    ]
  }

  const applicationMenuTemplate = env.isDevMode
    ? [walletMenuItem, editMenuItem, developMenuItem, toolsMenuItem, windowMenuItem, helpMenuItem]
    : [walletMenuItem, editMenuItem, toolsMenuItem, windowMenuItem, helpMenuItem]

  if (isMac) {
    applicationMenuTemplate.unshift(appMenuItem)
  }

  const menu = Menu.buildFromTemplate(applicationMenuTemplate)

  Menu.setApplicationMenu(menu)
}

export { updateApplicationMenu }
