import { app, BrowserWindow, Menu } from 'electron'
import windowStateKeeper from 'electron-window-state'
import * as path from 'path'
import listenToChannel from './channel'
import monitorChain from './monitor'
import menu from './menu'
import env from './env'

let mainWindow: Electron.BrowserWindow | null

listenToChannel()
function createWindow() {
  const windowState = windowStateKeeper({
    defaultWidth: 1366,
    defaultHeight: 768,
  })

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      devTools: env.isDevMode,
    },
  })

  windowState.manage(mainWindow)

  Menu.setApplicationMenu(menu)

  const ENTRY = {
    DEV: 'http://localhost:3000',
    PROD: `file://${path.join(__dirname, '../ui/index.html')}`,
  }
  mainWindow.loadURL(env.isDevMode ? ENTRY.DEV : ENTRY.PROD)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    mainWindow!.focus()
  })
  /**
   * @monitorChain
   * @description monitor network
   */
  monitorChain(mainWindow.webContents)
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
