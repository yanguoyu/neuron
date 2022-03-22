import React, { useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { MultisigConfig } from 'services/remote'
import Button from 'widgets/Button'
import CopyZone from 'widgets/CopyZone'
import Balance from 'components/Balance'
import SendFieldset from 'components/SendFieldset'
import { isMainnet as isMainnetUtil, getSyncStatus, getCurrentUrl } from 'utils'
import { useState as useGlobalState } from 'states'

import { useSendInfo } from './hooks'
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
    chain: {
      networkID,
      connectionStatus,
      syncState: { cacheTipBlockNumber, bestKnownBlockNumber, bestKnownBlockTimestamp },
    },
    settings: { networks = [] },
  } = useGlobalState()
  const isMainnet = isMainnetUtil(networks, networkID)
  const syncStatus = getSyncStatus({
    bestKnownBlockNumber,
    bestKnownBlockTimestamp,
    cacheTipBlockNumber,
    currentTimestamp: Date.now(),
    url: getCurrentUrl(networkID, networks),
  })
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
  } = useSendInfo({ isMainnet, balance })
  const isSendDisabled = useMemo(
    () => outputErrors.some(v => v.addrError || v.amountError) || sendInfoList.some(v => !v.address || !v.amount),
    [outputErrors, sendInfoList]
  )
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
          <Balance balance={balance} connectionStatus={connectionStatus} syncStatus={syncStatus} />
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
      </div>
      <div className={styles.sendActions}>
        <Button label={t('multisig-address.send-ckb.cancel')} type="cancel" onClick={closeDialog} />
        <Button
          disabled={isSendDisabled}
          label={t('multisig-address.send-ckb.send')}
          type="primary"
          onClick={closeDialog}
        />
      </div>
    </>
  )
}

SendFromMultisigDialog.displayName = 'SendFromMultisigDialog'

export default SendFromMultisigDialog
