import { formatInviteCode } from '@rotisserie/shared/accounts'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Share, View } from 'react-native'
import { useAuth, useMe, type Me } from '~/api/auth'
import {
  useChangeRole,
  useCreateInvite,
  useDeleteHousehold,
  useHousehold,
  useInvites,
  useLeaveHousehold,
  useRemoveMember,
  useRenameHousehold,
  useRevokeInvite,
  type Household,
  type HouseholdInvite,
  type HouseholdMember
} from '~/api/household'
import { FormError } from '~/components/AuthLayout'
import { Field, ListLink } from '~/components/controls'
import { Icon } from '~/components/Icon'
import { HeaderButton, ScreenHeader } from '~/components/ScreenHeader'
import { Sheet } from '~/components/Sheet'
import { useToast } from '~/components/Toast'
import { Button, Chip, ErrorState, Loading, SectionHeading, Text } from '~/components/ui'
import { shortDate, toIsoDate } from '~/lib/dates'
import { useColors } from '~/theme'

export default function HouseholdScreen() {
  const colors = useColors()
  const me = useMe()
  const household = useHousehold()
  const [renaming, setRenaming] = useState(false)
  const [selected, setSelected] = useState<HouseholdMember | null>(null)

  if (me === null) return null
  if (household.isPending) return <Loading />
  if (household.isError) return <ErrorState error={household.error} onRetry={() => household.refetch()} />

  const data = household.data
  const isOwner = me.household?.role === 'owner'

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        back="Done"
        modal
        right={isOwner ? <HeaderButton label="Rename" onPress={() => setRenaming(true)} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ gap: 28, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }}>
        <View style={{ gap: 4 }}>
          <Text variant="tiny" tone="ink2">
            HOUSEHOLD
          </Text>
          <Text variant="title" accessibilityRole="header">
            {data.name}
          </Text>
        </View>
        <People household={data} me={me} onSelect={setSelected} />
        {isOwner ? <Invites householdName={data.name} /> : null}
        <You household={data} me={me} />
      </ScrollView>
      <RenameSheet visible={renaming} current={data.name} onClose={() => setRenaming(false)} />
      <MemberSheet member={selected} onClose={() => setSelected(null)} />
    </View>
  )
}

function People({ household, me, onSelect }: { household: Household; me: Me; onSelect: (member: HouseholdMember) => void }) {
  const colors = useColors()
  const isOwner = me.household?.role === 'owner'
  return (
    <View>
      <SectionHeading>
        <Text variant="section" accessibilityRole="header">
          People
        </Text>
      </SectionHeading>
      {household.members.map((member) => {
        const you = member.userId === me.user.id
        const manageable = isOwner && !you
        return (
          <Pressable
            key={member.userId}
            accessibilityRole={manageable ? 'button' : undefined}
            disabled={!manageable}
            onPress={() => onSelect(member)}
            style={({ pressed }) => ({
              minHeight: 62,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              opacity: pressed ? 0.6 : 1
            })}
          >
            <Initial name={member.displayName} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{you ? `${member.displayName} (you)` : member.displayName}</Text>
              <Text variant="caption" tone="ink2" numberOfLines={1}>
                {member.email}
              </Text>
            </View>
            {member.role === 'owner' ? <Chip label="Owner" /> : null}
            {manageable ? <Icon name="chevronRight" size={16} color={colors.ink2} strokeWidth={2.5} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

function Initial({ name }: { name: string }) {
  const colors = useColors()
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.chip,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Text variant="label" tone="chipInk">
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  )
}

function Invites({ householdName }: { householdName: string }) {
  const colors = useColors()
  const toast = useToast()
  const invites = useInvites(true)
  const create = useCreateInvite()
  const revoke = useRevokeInvite()

  async function share(invite: HouseholdInvite) {
    const code = formatInviteCode(invite.code)
    try {
      await Share.share({
        message: `Join “${householdName}” on Rotisserie with the invite code ${code}. It works once, for 7 days.`
      })
    } catch {
      toast({ message: `Invite code ${code}` })
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <SectionHeading>
        <Text variant="section" accessibilityRole="header">
          Invites
        </Text>
      </SectionHeading>
      <Text variant="caption" tone="ink2">
        Each code lets one person join and stops working after 7 days.
      </Text>
      {(invites.data ?? []).map((invite) => (
        <View
          key={invite.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 6,
            borderBottomWidth: 1,
            borderBottomColor: colors.line
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="dish" selectable style={{ letterSpacing: 2 }}>
              {formatInviteCode(invite.code)}
            </Text>
            <Text variant="caption" tone="ink2">
              Until {shortDate(toIsoDate(new Date(invite.expiresAt)))}
            </Text>
          </View>
          <HeaderButton label="Share" onPress={() => void share(invite)} />
          <HeaderButton label="Revoke" disabled={revoke.isPending} onPress={() => revoke.mutate(invite.id)} />
        </View>
      ))}
      <FormError error={create.error ?? revoke.error} />
      <Button
        kind="secondary"
        label="Invite someone"
        busy={create.isPending}
        onPress={() => create.mutate(undefined, { onSuccess: (invite) => void share(invite) })}
      />
    </View>
  )
}

function You({ household, me }: { household: Household; me: Me }) {
  const auth = useAuth()
  const leave = useLeaveHousehold()
  const destroy = useDeleteHousehold()
  const [confirming, setConfirming] = useState(false)
  const alone = household.members.length === 1
  const onlyOwner =
    me.household?.role === 'owner' && household.members.filter((member) => member.role === 'owner').length === 1

  return (
    <View style={{ gap: 6 }}>
      <SectionHeading>
        <Text variant="section" accessibilityRole="header">
          You
        </Text>
      </SectionHeading>
      <ListLink label="Sign out" detail={me.user.email} onPress={() => void auth.signOut()} />
      {alone ? (
        <>
          <ListLink
            danger
            label={confirming ? 'Tap again to delete everything' : 'Delete household'}
            onPress={() => (confirming ? destroy.mutate() : setConfirming(true))}
          />
          <Text variant="caption" tone="ink2">
            Deletes every recipe, plan and meal in {household.name}.
          </Text>
        </>
      ) : onlyOwner ? (
        <Text variant="caption" tone="ink2" style={{ paddingTop: 10 }}>
          You’re the only owner. Make someone else an owner before you leave.
        </Text>
      ) : (
        <ListLink
          danger
          label={confirming ? 'Tap again to leave' : 'Leave household'}
          onPress={() => (confirming ? leave.mutate(me.user.id) : setConfirming(true))}
        />
      )}
      <FormError error={leave.error ?? destroy.error} />
    </View>
  )
}

function RenameSheet({ visible, current, onClose }: { visible: boolean; current: string; onClose: () => void }) {
  const rename = useRenameHousehold()
  const [name, setName] = useState(current)

  useEffect(() => {
    if (visible) setName(current)
  }, [visible, current])

  const ready = name.trim() !== '' && name.trim() !== current

  return (
    <Sheet visible={visible} title="Rename household" onClose={onClose}>
      <View style={{ gap: 14, paddingBottom: 8 }}>
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => ready && rename.mutate(name, { onSuccess: onClose })}
        />
        <FormError error={rename.error} />
        <Button
          label="Save"
          busy={rename.isPending}
          disabled={!ready}
          onPress={() => rename.mutate(name, { onSuccess: onClose })}
        />
      </View>
    </Sheet>
  )
}

function MemberSheet({ member, onClose }: { member: HouseholdMember | null; onClose: () => void }) {
  const changeRole = useChangeRole()
  const remove = useRemoveMember()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setConfirming(false)
    changeRole.reset()
    remove.reset()
  }, [member?.userId])

  const firstName = member?.displayName.split(' ')[0] ?? ''

  return (
    <Sheet visible={member !== null} title={member?.displayName ?? ''} onClose={onClose}>
      {member ? (
        <View style={{ gap: 6, paddingBottom: 8 }}>
          <Text variant="caption" tone="ink2">
            {member.role === 'owner'
              ? `${firstName} is an owner: they can rename the household, invite people and manage who’s in it.`
              : `${firstName} is a member: they can plan, log and edit recipes.`}
          </Text>
          <ListLink
            label={member.role === 'owner' ? 'Make a member' : 'Make an owner'}
            onPress={() =>
              changeRole.mutate(
                { userId: member.userId, role: member.role === 'owner' ? 'member' : 'owner' },
                { onSuccess: onClose }
              )
            }
          />
          <ListLink
            danger
            label={confirming ? `Tap again to remove ${firstName}` : 'Remove from household'}
            onPress={() => (confirming ? remove.mutate(member.userId, { onSuccess: onClose }) : setConfirming(true))}
          />
          <FormError error={changeRole.error ?? remove.error} />
        </View>
      ) : null}
    </Sheet>
  )
}
