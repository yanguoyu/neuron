import React, { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchBox } from 'office-ui-fabric-react'
import Button from 'widgets/Button'
import { useOnLocaleChange, isMainnet as isMainnetUtil } from 'utils'
import { useState as useGlobalState } from 'states'
import MultiSignAddressCreateDialog from 'components/MultiSignAddressCreateDialog'
import CopyZone from 'widgets/CopyZone'
import { More } from 'widgets/Icons/icon'
import { CustomizableDropdown } from 'widgets/Dropdown'
import MultiSignAddressInfo from 'components/MultiSignAddressInfo'
import { EditTextField } from 'widgets/TextField'
import { MultiSignConfig } from 'services/remote'

import { useSearch, useDialogWrapper, useConfigManage, useImportConfig, useExportConfig } from './hooks'
import styles from './multi-sign-address.module.scss'

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

const tableActions = ['info']

const MultiSignAddress = () => {
  const [t, i18n] = useTranslation()
  useOnLocaleChange(i18n)
  const {
    wallet: { id: walletId },
    chain: { networkID },
    settings: { networks = [] },
  } = useGlobalState()
  const { keywords, onKeywordsChange, onSearch, searchKeywords } = useSearch()
  const { openDialog, closeDialog, dialogRef, isDialogOpen } = useDialogWrapper()
  const { config, saveConfig, updateConfig } = useConfigManage({ walletId, searchKeywords })
  const { openDialog: openInfoDialog, closeDialog: closeInfoDialog, dialogRef: infoDialog } = useDialogWrapper()
  const [multiSignConfig, changeMultiSignConfig] = useState<MultiSignConfig | undefined>()
  const onClickItem = useCallback(
    (viewConfig: MultiSignConfig) => (option: { key: string }) => {
      if (option.key === 'info') {
        openInfoDialog()
        changeMultiSignConfig(viewConfig)
      }
    },
    [openInfoDialog]
  )
  const listActionOptions = useMemo(
    () => tableActions.map(key => ({ key, label: t(`multi-sign-address.table.actions.${key}`) })),
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
  const { selectIds, isAllSelected, onChangeChecked, onChangeCheckedAll, exportConfig } = useExportConfig(config)
  return (
    <div>
      <div className={styles.head}>
        <SearchBox
          value={keywords}
          className={styles.searchBox}
          styles={searchBoxStyles}
          placeholder={t('multi-sign-address.search.placeholder')}
          onChange={onKeywordsChange}
          onSearch={onSearch}
          iconProps={{ iconName: 'Search', styles: { root: { height: '18px' } } }}
        />
        <div className={styles.actions}>
          <Button label={t('multi-sign-address.add.label')} type="primary" onClick={openDialog} />
          <Button label={t('multi-sign-address.import.label')} type="primary" onClick={onImportConfig} />
          <Button label={t('multi-sign-address.export.label')} type="primary" onClick={exportConfig} />
        </div>
      </div>
      <table className={styles.multiSignConfig}>
        <thead>
          <tr>
            <th>
              <input type="checkbox" onChange={onChangeCheckedAll} checked={isAllSelected} />
            </th>
            {['address', 'alias', 'type'].map(field => (
              <th key={field}>{t(`multi-sign-address.table.${field}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.map(v => (
            <tr key={v.id}>
              <td>
                <input
                  data-config-id={v.id}
                  type="checkbox"
                  onChange={onChangeChecked}
                  checked={selectIds.includes(v.id.toString())}
                />
              </td>
              <td>
                <CopyZone
                  content={v.fullPayload}
                  className={styles.fullPayload}
                  name={t('multi-sign-address.table.copy-address')}
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
      <dialog ref={dialogRef} className={styles.dialog}>
        {isDialogOpen && <MultiSignAddressCreateDialog closeDialog={closeDialog} confirm={saveConfig} />}
      </dialog>
      <dialog ref={importDialog} className={styles.dialog}>
        {importConfig && (
          <div>
            {importErr && <div className={styles.error}>{importErr}</div>}
            <MultiSignAddressInfo
              m={importConfig.m.toString()}
              n={importConfig.n.toString()}
              r={importConfig.r}
              blake160s={importConfig.blake160s || []}
              multiSignAddress={importConfig.fullPayload}
            />
            <div className={styles.importActions}>
              <Button
                label={t('multi-sign-address.import-dialog.actions.cancel')}
                type="cancel"
                onClick={closeImportDialog}
              />
              <Button
                label={t('multi-sign-address.import-dialog.actions.confirm')}
                type="primary"
                onClick={confirmImport}
              />
            </div>
          </div>
        )}
      </dialog>
      <dialog ref={infoDialog} className={styles.dialog}>
        {multiSignConfig && (
          <MultiSignAddressInfo
            m={multiSignConfig.m.toString()}
            n={multiSignConfig.n.toString()}
            r={multiSignConfig.r}
            blake160s={multiSignConfig.blake160s || []}
            multiSignAddress={multiSignConfig.fullPayload}
          />
        )}
        <div className={styles.ok}>
          <Button label={t('multi-sign-address.ok')} type="ok" onClick={closeInfoDialog} />
        </div>
      </dialog>
    </div>
  )
}

MultiSignAddress.displayName = 'MultiSignAddress'

export default MultiSignAddress
