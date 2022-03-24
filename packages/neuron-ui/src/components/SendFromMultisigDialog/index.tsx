import React, { useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { MultisigConfig } from 'services/remote'
import Button from 'widgets/Button'
import CopyZone from 'widgets/CopyZone'
import TextField from 'widgets/TextField'
import SendFieldset from 'components/SendFieldset'
import { isMainnet as isMainnetUtil, shannonToCKBFormatter, validateTotalAmount } from 'utils'
import { useState as useGlobalState } from 'states'

import { useSendInfo, useOnSumbit } from './hooks'
import styles from './sendFromMultisigDialog.module.scss'

const SendCkbTitle = React.memo(({ fullPayload }: { fullPayload: string }) => {
  const [t] = useTranslation()
  return (
    <CopyZone content={fullPayload} className={styles.fullPayload} name={t('multisig-address.table.copy-address')}>
      <span className={styles.overflow}>{fullPayload.slice(0, -6)}</span>
      <span>...</span>
      <span>{fullPayload.slice(-6)}</span>
    </CopyZone>
  )
})

const SendFromMultisigDialog = ({
  multisigConfig,
  balance,
  closeDialog,
}: {
  multisigConfig: MultisigConfig
  balance: string
  closeDialog: () => void
}) => {
  const [t] = useTranslation()
  const {
    chain: { networkID },
    settings: { networks = [] },
    wallet,
  } = useGlobalState()
  const isMainnet = isMainnetUtil(networks, networkID)
  const {
    sendInfoList,
    isSendMax,
    outputErrors,
    isAddOneBtnDisabled,
    isMaxBtnDisabled,
    addSendInfo,
    deleteSendInfo,
    onSendMaxClick,
    onSendInfoChange,
    totalAmount,
    errorMessage,
  } = useSendInfo({ isMainnet, balance, address: multisigConfig.fullPayload, t, multisigConfig })
  const totalAmountErrorMessage = useMemo(() => {
    let errorMessageUnderTotal = errorMessage
    try {
      validateTotalAmount(totalAmount, '0', balance)
    } catch (err) {
      errorMessageUnderTotal = t(err.message)
    }
    return errorMessageUnderTotal
  }, [errorMessage, totalAmount, balance, t])
  const isSendDisabled = useMemo(
    () =>
      outputErrors.some(v => v.addrError || v.amountError) ||
      sendInfoList.some(v => !v.address || !v.amount) ||
      !!totalAmountErrorMessage,
    [outputErrors, sendInfoList, totalAmountErrorMessage]
  )
  const onSumbit = useOnSumbit({ outputs: sendInfoList, isMainnet, multisigReadySend: multisigConfig.m === 1 })
  return (
    <>
      <div className={styles.sendCKBTitle}>
        <Trans
          i18nKey="multisig-address.send-ckb.title"
          values={multisigConfig}
          components={[<SendCkbTitle fullPayload={multisigConfig.fullPayload} />]}
        />
      </div>
      <div className={styles.sendContainer}>
        <div className={styles.balance}>
          <span>{`${t('overview.balance')}:`}</span>
          <CopyZone content={shannonToCKBFormatter(balance, false, '')} name={t('overview.copy-balance')}>
            <span className={styles.balanceValue}>{shannonToCKBFormatter(balance)}</span>
          </CopyZone>
        </div>
        <div className={styles.sendFieldContainer}>
          {sendInfoList.map(({ address, amount }, idx) => (
            <SendFieldset
              key={address || idx}
              idx={idx}
              item={{ address, amount, disabled: idx === sendInfoList.length - 1 && isSendMax }}
              errors={outputErrors[idx]}
              isSendMax={isSendMax}
              isAddBtnShow={idx === sendInfoList.length - 1}
              isAddOneBtnDisabled={isAddOneBtnDisabled}
              isMaxBtnDisabled={isMaxBtnDisabled}
              isTimeLockable={false}
              isMaxBtnShow={idx === sendInfoList.length - 1}
              isRemoveBtnShow={sendInfoList.length > 1}
              onOutputAdd={addSendInfo}
              onOutputRemove={deleteSendInfo}
              onSendMaxClick={onSendMaxClick}
              onItemChange={onSendInfoChange}
            />
          ))}
        </div>
        <TextField
          field="totalAmount"
          label={t('send.total-amount')}
          value={`${shannonToCKBFormatter(totalAmount)} CKB`}
          readOnly
          error={totalAmountErrorMessage}
        />
      </div>
      <div className={styles.sendActions}>
        <Button label={t('multisig-address.send-ckb.cancel')} type="cancel" onClick={closeDialog} />
        <Button
          disabled={isSendDisabled}
          label={t('multisig-address.send-ckb.send')}
          type="primary"
          onClick={onSumbit}
          data-status="ready"
          data-wallet-id={wallet.id}
        />
      </div>
    </>
  )
}

SendFromMultisigDialog.displayName = 'SendFromMultisigDialog'

export default SendFromMultisigDialog
