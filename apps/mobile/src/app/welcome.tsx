import { canonicalizeInviteCode, formatInviteCode, INVITE_CODE_LENGTH, isInviteCode } from '@rotisserie/shared/accounts'
import { useState } from 'react'
import { View } from 'react-native'
import { useAuth, useMe } from '~/api/auth'
import { useCreateHousehold, useJoinHousehold } from '~/api/household'
import { AuthLayout, FormError } from '~/components/AuthLayout'
import { Field, Segmented } from '~/components/controls'
import { Button, Text } from '~/components/ui'

type Mode = 'start' | 'join'

const MODES: { value: Mode; label: string }[] = [
  { value: 'start', label: 'Start one' },
  { value: 'join', label: 'Join with a code' }
]

export default function WelcomeScreen() {
  const auth = useAuth()
  const me = useMe()
  const firstName = me?.user.displayName.split(' ')[0] ?? ''
  const [mode, setMode] = useState<Mode>('start')
  const [name, setName] = useState(`${firstName}’s kitchen`)
  const [code, setCode] = useState('')
  const create = useCreateHousehold()
  const join = useJoinHousehold()

  if (me === null) return null

  return (
    <AuthLayout
      title={`Welcome, ${firstName}`}
      subtitle="A household shares one recipe book, one plan and one history. Start one, or join the people you cook with."
      footer={<Button kind="plain" label={`Not ${me.user.email}? Sign out`} onPress={() => void auth.signOut()} />}
    >
      <View style={{ gap: 18 }}>
        <Segmented label="Household" options={MODES} value={mode} onChange={setMode} />
        {mode === 'start' ? (
          <View style={{ gap: 14 }}>
            <Field label="Household name" value={name} onChangeText={setName} returnKeyType="go" />
            <FormError error={create.error} />
            <Button
              label="Start household"
              busy={create.isPending}
              disabled={name.trim() === ''}
              onPress={() => create.mutate(name)}
            />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Field
              label="Invite code"
              value={formatInviteCode(code)}
              onChangeText={(text) => setCode(canonicalizeInviteCode(text).slice(0, INVITE_CODE_LENGTH))}
              placeholder="ABCD-2345"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              inputStyle={{ letterSpacing: 2 }}
            />
            <Text variant="caption" tone="ink2">
              Ask an owner of the household for a code. They make one from Household → Invite someone.
            </Text>
            <FormError error={join.error} />
            <Button
              label="Join household"
              busy={join.isPending}
              disabled={!isInviteCode(code)}
              onPress={() => join.mutate(code)}
            />
          </View>
        )}
      </View>
    </AuthLayout>
  )
}
