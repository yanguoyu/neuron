import { useCallback, useState, useMemo } from 'react'
import { useOutputErrors, outputsToTotalAmount, CapacityUnit, validateOutputs, shannonToCKBFormatter } from 'utils'
import { useDispatch } from 'states'
import { AppActions } from 'states/stateProvider/reducer'

export const useSendInfo = ({ isMainnet, balance }: { isMainnet: boolean; balance: string }) => {
  const [sendInfoList, setSendInfoList] = useState<
    { address: string | undefined; amount: string | undefined; unit: CapacityUnit }[]
  >([{ address: undefined, amount: undefined, unit: CapacityUnit.CKB }])
  const [isSendMax, setIsSendMax] = useState(false)
  const addSendInfo = useCallback(() => {
    setSendInfoList(v => [...v, { address: undefined, amount: undefined, unit: CapacityUnit.CKB }])
    setIsSendMax(false)
  }, [setSendInfoList, setIsSendMax])
  const deleteSendInfo = useCallback(
    e => {
      const {
        dataset: { idx = '-1' },
      } = e.currentTarget
      setSendInfoList(v => [...v.slice(0, +idx), ...v.slice(+idx + 1)])
    },
    [setSendInfoList]
  )
  const onSendInfoChange = useCallback(e => {
    const {
      dataset: { idx = '-1', field },
      value,
    } = e.currentTarget as { dataset: { idx: string; field: 'address' | 'amount' }; value: string }
    setSendInfoList(v => {
      const copy = [...v]
      copy[+idx][field] = value
      return copy
    })
  }, [])
  const onSendMaxClick = useCallback(
    e => {
      const {
        dataset: { isOn = 'false' },
      } = e.currentTarget
      const sendMaxOnClick = isOn === 'false'
      setIsSendMax(sendMaxOnClick)
      setSendInfoList(originalValue => {
        const copy = [...originalValue]
        if (sendMaxOnClick) {
          const totalAmount = outputsToTotalAmount(copy.slice(0, copy.length - 1).filter(v => !!v.amount))
          copy[copy.length - 1].amount = shannonToCKBFormatter((BigInt(balance) - BigInt(totalAmount)).toString())
        } else {
          copy[copy.length - 1].amount = '0'
        }
        return copy
      })
    },
    [setIsSendMax, balance]
  )
  const outputErrors = useOutputErrors(sendInfoList, isMainnet)
  const isAddOneBtnDisabled = useMemo(() => {
    const totalAmount = outputsToTotalAmount(sendInfoList.filter(v => !!v.amount))
    return (
      outputErrors.some(v => v.addrError || v.amountError) ||
      sendInfoList.some(v => !v.address || !v.amount) ||
      BigInt(totalAmount) >= BigInt(balance)
    )
  }, [outputErrors, sendInfoList, balance])
  const isMaxBtnDisabled = useMemo(() => {
    try {
      validateOutputs(sendInfoList, isMainnet, true)
    } catch {
      return true
    }
    return false
  }, [sendInfoList, isMainnet])
  return {
    sendInfoList,
    addSendInfo,
    deleteSendInfo,
    onSendInfoChange,
    isSendMax,
    onSendMaxClick,
    isAddOneBtnDisabled,
    outputErrors,
    isMaxBtnDisabled,
  }
}

export const useOnSumbit = ({
  outputs,
  isMainnet,
}: {
  outputs: { address: string | undefined; amount: string | undefined; unit: CapacityUnit }[]
  isMainnet: boolean
}) => {
  const dispatch = useDispatch()
  return useCallback(
    (e: React.FormEvent) => {
      const {
        dataset: { walletId, status },
      } = e.target as HTMLFormElement
      e.preventDefault()
      if (status !== 'ready') {
        return
      }
      try {
        validateOutputs(outputs, isMainnet)
        dispatch({
          type: AppActions.RequestPassword,
          payload: {
            walletID: walletId as string,
            actionType: 'send',
          },
        })
      } catch {
        // ignore
      }
    },
    [dispatch, outputs, isMainnet]
  )
}

export default {
  useSendInfo,
}
