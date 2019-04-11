import React, { useCallback, useEffect, useRef } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import { Button, InputGroup, FormControl } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'

import Screen from '../../widgets/Screen'
import ScreenButtonRow from '../../widgets/ScreenButtonRow'

import { ContentProps } from '../../containers/MainContent'
import { initState } from '../../containers/MainContent/state'
import { MainActions, actionCreators } from '../../containers/MainContent/reducer'

import { Routes } from '../../utils/const'
import { verifyWalletSubmission } from '../../utils/validators'
import { useNeuronWallet } from '../../utils/hooks'

const inptus = [
  { label: 'password', key: 'password', type: 'password' },
  { label: 'confirm-password', key: 'confirmPassword', type: 'password' },
  { label: 'name', key: 'name', type: 'text' },
]

const WalletSubmission = (props: React.PropsWithoutRef<ContentProps & RouteComponentProps>) => {
  const [t] = useTranslation()
  const {
    settings: { wallets },
  } = useNeuronWallet()

  const { dispatch, mnemonic, history } = props
  const cachedWalletsCount = useRef(wallets.length)

  useEffect(() => {
    dispatch({
      type: MainActions.UpdateMnemonic,
      payload: { name: `wallet @${Math.round(Math.random() * 100)}` },
    })
  }, [])

  useEffect(() => {
    if (cachedWalletsCount.current !== wallets.length) {
      dispatch({
        type: MainActions.UpdateMnemonic,
        payload: initState.mnemonic,
      })
      // TODO: send message to neuron-wallet and listen to response
      history.push(`${Routes.Prompt}/create-wallet-success?name=${mnemonic.name.replace(/\s/g, '%20')}`)
    }
  }, [wallets.length])

  const onChange = useCallback(
    (field: keyof typeof mnemonic) => (e: React.FormEvent<{ value: string }>) => {
      const { value } = e.currentTarget
      dispatch({
        type: MainActions.UpdateMnemonic,
        payload: { [field]: value },
      })
    },
    [],
  )

  const onBack = useCallback(() => {
    history.goBack()
  }, [])

  const onNext = useCallback(
    (params: { name: string; password: string; imported: string }) => () => {
      dispatch(
        actionCreators.importMnemonic({ name: params.name, password: params.password, mnemonic: params.imported }),
      )
    },
    [],
  )

  const message = 'wizard.set-a-strong-password-to-protect-your-wallet'
  type MnemonicKey = keyof typeof mnemonic
  const disableNext = !verifyWalletSubmission(mnemonic)

  return (
    <Screen>
      <div>
        <h1>{t(message)}</h1>
        {inptus.map(input => (
          <InputGroup key={input.key}>
            <InputGroup.Prepend>
              <InputGroup.Text>{t(`wizard.${input.label}`)}</InputGroup.Text>
            </InputGroup.Prepend>
            <FormControl
              type={input.type}
              value={mnemonic[input.key as MnemonicKey]}
              onChange={onChange(input.key as MnemonicKey)}
            />
          </InputGroup>
        ))}
        <ScreenButtonRow>
          <Button role="button" onClick={onBack} onKeyPress={onBack}>
            {t('wizard.back')}
          </Button>
          <Button role="button" onClick={onNext(mnemonic)} onKeyPress={onNext(mnemonic)} disabled={disableNext}>
            {t('wizard.next')}
          </Button>
        </ScreenButtonRow>
      </div>
    </Screen>
  )
}

WalletSubmission.displayName = 'WalletSubmission'

export default WalletSubmission
