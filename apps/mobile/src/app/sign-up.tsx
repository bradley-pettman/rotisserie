import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { useAuth } from '~/api/auth'
import { AuthLayout, fieldError, FormError } from '~/components/AuthLayout'
import { Field } from '~/components/controls'
import { Button, Text } from '~/components/ui'

const MIN_PASSWORD = 8

export default function SignUpScreen() {
  const auth = useAuth()
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signUp = useMutation({ mutationFn: auth.signUp })
  const ready = displayName.trim() !== '' && email.trim() !== '' && password.length >= MIN_PASSWORD

  function submit() {
    if (ready) signUp.mutate({ displayName, email, password })
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Then start a household or join the people you cook with."
      footer={<Button kind="plain" label="Already have an account? Sign in" onPress={() => router.replace('/sign-in')} />}
    >
      <View style={{ gap: 14 }}>
        <Field
          label="Your name"
          value={displayName}
          onChangeText={setDisplayName}
          textContentType="name"
          autoComplete="name"
          returnKeyType="next"
        />
        <FieldError message={fieldError(signUp.error, 'displayName')} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
        />
        <FieldError message={fieldError(signUp.error, 'email')} />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Text variant="caption" tone={fieldError(signUp.error, 'password') ? 'danger' : 'ink2'}>
          {fieldError(signUp.error, 'password') ?? `At least ${MIN_PASSWORD} characters`}
        </Text>
        <FormError error={signUp.error} />
        <Button label="Create account" busy={signUp.isPending} disabled={!ready} onPress={submit} />
      </View>
    </AuthLayout>
  )
}

function FieldError({ message }: { message: string | undefined }) {
  if (message === undefined) return null
  return (
    <Text variant="caption" tone="danger">
      {message}
    </Text>
  )
}
