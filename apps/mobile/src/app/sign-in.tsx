import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { useAuth } from '~/api/auth'
import { AuthLayout, FormError } from '~/components/AuthLayout'
import { Field } from '~/components/controls'
import { Button } from '~/components/ui'

export default function SignInScreen() {
  const auth = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signIn = useMutation({ mutationFn: auth.signIn })
  const ready = email.trim() !== '' && password !== ''

  function submit() {
    if (ready) signIn.mutate({ email, password })
  }

  return (
    <AuthLayout
      title="Rotisserie"
      subtitle="Plan meals. Shop smarter. Cook. Repeat."
      footer={<Button kind="plain" label="New here? Create an account" onPress={() => router.replace('/sign-up')} />}
    >
      <View style={{ gap: 14 }}>
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
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <FormError error={signIn.error} />
        <Button label="Sign in" busy={signIn.isPending} disabled={!ready} onPress={submit} />
      </View>
    </AuthLayout>
  )
}
