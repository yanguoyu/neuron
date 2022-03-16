import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchBox, MessageBar, MessageBarType } from 'office-ui-fabric-react'
import Button from 'widgets/Button'
import { useOnLocaleChange, isMainnet as isMainnetUtil } from 'utils'
import { useState as useGlobalState } from 'states'
import MultisigAddressCreateDialog from 'components/MultisigAddressCreateDialog'
import CopyZone from 'widgets/CopyZone'
import { More } from 'widgets/Icons/icon'
import { CustomizableDropdown } from 'widgets/Dropdown'
import MultisigAddressInfo from 'components/MultisigAddressInfo'
import { EditTextField } from 'widgets/TextField'
import { MultisigConfig } from 'services/remote'

import { useSearch, useDialogWrapper, useConfigManage, useImportConfig, useExportConfig, useActions } from './hooks'
import styles from './multisig-address.module.scss'

const searchBoxStyles = {
  root: {
    background: '#e3e3e3',
    borderRadius: 0,
    fontSize: '1rem',
    border: '1px solid rgb(204, 204, 204)',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
}
const messageBarStyle = { text: { alignItems: 'center' } }

const tableActions = ['info', 'delete']

const MultisigAddress = () => {
  const [t, i18n] = useTranslation()
  useOnLocaleChange(i18n)
  const {
    wallet: { id: walletId },
    chain: { networkID },
    settings: { networks = [] },
  } = useGlobalState()
  const { keywords, onKeywordsChange, onSearch, searchKeywords } = useSearch()
  const { openDialog, closeDialog, dialogRef, isDialogOpen } = useDialogWrapper()
  const { configs, saveConfig, updateConfig, deleteConfigById } = useConfigManage({ walletId, searchKeywords })
  const { deleteAction, infoAction } = useActions({ deleteConfigById })
  const onClickItem = useCallback(
    (multisigConfig: MultisigConfig) => (option: { key: string }) => {
      if (option.key === 'info') {
        infoAction.action(multisigConfig)
      } else if (option.key === 'delete') {
        deleteAction.action(multisigConfig)
      }
    },
    [deleteAction, infoAction]
  )
  const listActionOptions = useMemo(
    () => tableActions.map(key => ({ key, label: t(`multisig-address.table.actions.${key}`) })),
    [t]
  )
  const isMainnet = isMainnetUtil(networks, networkID)
  const {
    importErr,
    importConfig,
    onImportConfig,
    dialogRef: importDialog,
    closeDialog: closeImportDialog,
    confirm: confirmImport,
  } = useImportConfig({ isMainnet, saveConfig })
  const { selectIds, isAllSelected, onChangeChecked, onChangeCheckedAll, exportConfig } = useExportConfig(configs)
  return (
    <div>
      <div className={styles.head}>
        <SearchBox
          value={keywords}
          className={styles.searchBox}
          styles={searchBoxStyles}
          placeholder={t('multisig-address.search.placeholder')}
          onChange={onKeywordsChange}
          onSearch={onSearch}
          iconProps={{ iconName: 'Search', styles: { root: { height: '18px' } } }}
        />
        <div className={styles.actions}>
          <Button label={t('multisig-address.add.label')} type="primary" onClick={openDialog} />
          <Button label={t('multisig-address.import.label')} type="primary" onClick={onImportConfig} />
          <Button label={t('multisig-address.export.label')} type="primary" onClick={exportConfig} />
        </div>
      </div>
      {configs.length ? (
        <table className={styles.multisigConfig}>
          <thead>
            <tr>
              <th>
                <input type="checkbox" onChange={onChangeCheckedAll} checked={isAllSelected} />
              </th>
              {['address', 'alias', 'type'].map(field => (
                <th key={field}>{t(`multisig-address.table.${field}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {configs.map(v => (
              <tr key={v.id}>
                <td>
                  <input
                    data-config-id={v.id}
                    type="checkbox"
                    onChange={onChangeChecked}
                    checked={selectIds.includes(v.id)}
                  />
                </td>
                <td>
                  <CopyZone
                    content={v.fullPayload}
                    className={styles.fullPayload}
                    name={t('multisig-address.table.copy-address')}
                  >
                    <span className={styles.overflow}>{v.fullPayload.slice(0, -6)}</span>
                    <span>...</span>
                    <span>{v.fullPayload.slice(-6)}</span>
                  </CopyZone>
                </td>
                <td>
                  <EditTextField field="alias" value={v.alias || ''} onChange={updateConfig(v.id)} />
                </td>
                <td>
                  {v.m}
                  &nbsp;of&nbsp;
                  {v.n}
                </td>
                <td>
                  <CustomizableDropdown options={listActionOptions} onClickItem={onClickItem(v)}>
                    <More className={styles.more} />
                  </CustomizableDropdown>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.noData}>{t('multisig-address.no-data')}</div>
      )}
      <dialog ref={dialogRef} className={styles.dialog}>
        {isDialogOpen && <MultisigAddressCreateDialog closeDialog={closeDialog} confirm={saveConfig} />}
      </dialog>
      <dialog ref={importDialog} className={styles.dialog}>
        {importConfig && (
          <div>
            {importErr && (
              <MessageBar messageBarType={MessageBarType.error} styles={messageBarStyle}>
                {importErr}
              </MessageBar>
            )}
            <MultisigAddressInfo
              m={importConfig.m.toString()}
              n={importConfig.n.toString()}
              r={importConfig.r}
              addresses={importConfig.addresses || []}
              multisigAddress={importConfig.fullPayload}
            />
            <br />
            <MessageBar messageBarType={MessageBarType.warning} styles={messageBarStyle}>
              {t('multisig-address.import-dialog.notice')}
            </MessageBar>
            <div className={styles.importActions}>
              <Button
                label={t('multisig-address.import-dialog.actions.cancel')}
                type="cancel"
                onClick={closeImportDialog}
              />
              <Button
                label={t('multisig-address.import-dialog.actions.confirm')}
                type="primary"
                onClick={confirmImport}
              />
            </div>
          </div>
        )}
      </dialog>
      <dialog ref={infoAction.dialogRef} className={styles.dialog}>
        {infoAction.multisigConfig && (
          <MultisigAddressInfo
            m={infoAction.multisigConfig.m.toString()}
            n={infoAction.multisigConfig.n.toString()}
            r={infoAction.multisigConfig.r}
            addresses={infoAction.multisigConfig.addresses || []}
            multisigAddress={infoAction.multisigConfig.fullPayload}
          />
        )}
        <div className={styles.ok}>
          <Button label={t('multisig-address.ok')} type="ok" onClick={infoAction.closeDialog} />
        </div>
      </dialog>
    </div>
  )
}

MultisigAddress.displayName = 'MultisigAddress'

export default MultisigAddress