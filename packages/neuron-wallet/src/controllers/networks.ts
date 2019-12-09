import { dialog } from 'electron'
import { NetworkType, NetworkID, Network } from 'types/network'
import NetworksService from 'services/networks'
import { ResponseCode } from 'utils/const'
import { IsRequired, InvalidName, NetworkNotFound, CurrentNetworkNotSet } from 'exceptions'
import i18n from 'utils/i18n'

const networksService = NetworksService.getInstance()

export default class NetworksController {
  public static getAll() {
    const networks = networksService.getAll()
    return {
      status: ResponseCode.Success,
      result: networks,
    }
  }

  public static get(id: NetworkID) {
    if (typeof id === 'undefined') {
      throw new IsRequired('ID')
    }

    const network = networksService.get(id)
    if (!network) {
      throw new NetworkNotFound(id)
    }

    return {
      status: ResponseCode.Success,
      result: network,
    }
  }

  public static async create({ name, remote, type = NetworkType.Normal }: Network) {
    if (!name || !remote) {
      throw new IsRequired('Name and address')
    }
    if (name === 'error') {
      throw new InvalidName('Network')
    }

    const created = await networksService.create(name, remote, type)
    return {
      status: ResponseCode.Success,
      result: created,
    }
  }

  public static async update(id: NetworkID, options: Partial<Network>) {
    if (options.name && options.name === 'error') {
      throw new InvalidName('Network')
    }

    await networksService.update(id, options)
    return {
      status: ResponseCode.Success,
      result: true,
    }
  }

  public static async delete(id: NetworkID) {
    const networkService = NetworksService.getInstance()
    const network = networkService.get(id)
    if (!network) {
      throw new NetworkNotFound(id)
    }
    const currentID = networkService.getCurrentID()

    const messageValue = await dialog.showMessageBox(
      {
        type: 'warning',
        title: i18n.t(`messageBox.remove-network.title`),
        message: i18n.t(`messageBox.remove-network.message`, {
          name: network.name,
          address: network.remote,
        }),
        detail: currentID === id ? i18n.t('messageBox.remove-network.alert') : '',
        buttons: [i18n.t('messageBox.button.confirm'), i18n.t('messageBox.button.discard')],
      }
    )

    if (messageValue.response === 0) {
      try {
        networksService.delete(id)
        return {
          status: ResponseCode.Success,
          result: true,
        }
      } catch (err) {
        dialog.showMessageBox({
          type: 'error',
          message: err.message,
        })
      }
    }
  }

  public static currentID() {
    const currentID = networksService.getCurrentID()
    if (currentID) {
      return {
        status: ResponseCode.Success,
        result: currentID,
      }
    }
    throw new CurrentNetworkNotSet()
  }

  public static async activate(id: NetworkID) {
    await networksService.activate(id)
    return {
      status: ResponseCode.Success,
      result: true,
    }
  }
}
