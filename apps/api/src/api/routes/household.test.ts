import { describe, expect, it } from 'vitest'
import { DB } from '~/db/connection'
import { createHousehold, createMember, createUser, defaultMember } from '~/test/accounts'
import { send } from '~/test/api'
import { recipeInput } from '~/test/factories'

async function invite(as = defaultMember()) {
  const response = await send('POST', '/household/invites', undefined, { as })
  return response.body.code as string
}

describe('POST /household', () => {
  it('starts a household with the caller as its owner', async () => {
    const user = await createUser({ displayName: 'Sam' })

    const response = await send('POST', '/household', { name: '  The Pettmans ' }, { as: user })

    expect(response).toMatchObject({
      status: 201,
      body: { name: 'The Pettmans', members: [{ userId: user.userId, displayName: 'Sam', role: 'owner' }] }
    })
    expect((await send('GET', '/me', undefined, { as: user })).body.household).toMatchObject({ role: 'owner' })
  })

  it('returns 409 for someone who already has a household', async () => {
    expect(await send('POST', '/household', { name: 'Second' })).toMatchObject({
      status: 409,
      body: { error: { code: 'conflict' } }
    })
  })
})

describe('GET /household', () => {
  it('lists the members in the order they joined', async () => {
    const owner = defaultMember()
    const member = await createMember({ householdId: owner.householdId, displayName: 'Alex' })

    expect(await send('GET', '/household', undefined, { as: member })).toMatchObject({
      status: 200,
      body: {
        id: owner.householdId,
        members: [
          { userId: owner.userId, role: 'owner' },
          { userId: member.userId, displayName: 'Alex', role: 'member' }
        ]
      }
    })
  })
})

describe('PATCH /household', () => {
  it('renames the household for an owner', async () => {
    expect(await send('PATCH', '/household', { name: 'Kitchen' })).toMatchObject({ status: 200, body: { name: 'Kitchen' } })
  })

  it('returns 403 for a member', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    expect(await send('PATCH', '/household', { name: 'Mine now' }, { as: member })).toMatchObject({
      status: 403,
      body: { error: { code: 'forbidden' } }
    })
  })
})

describe('invites', () => {
  it('creates, lists and revokes invites for an owner', async () => {
    const created = await send('POST', '/household/invites')
    expect(created).toMatchObject({ status: 201, body: { code: expect.stringMatching(/^[A-HJKMNP-TV-Z2-9]{8}$/) } })

    expect((await send('GET', '/household/invites')).body).toEqual([created.body])

    expect((await send('DELETE', `/household/invites/${created.body.id}`)).status).toBe(204)
    expect((await send('GET', '/household/invites')).body).toEqual([])
    expect((await send('DELETE', `/household/invites/${created.body.id}`)).status).toBe(404)
  })

  it('leaves expired invites out of the list', async () => {
    await invite()
    await DB.query(`UPDATE household_invites SET expires_at = NOW() - INTERVAL '1 second'`)

    expect((await send('GET', '/household/invites')).body).toEqual([])
  })

  it('are only for owners', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    expect((await send('POST', '/household/invites', undefined, { as: member })).status).toBe(403)
    expect((await send('GET', '/household/invites', undefined, { as: member })).status).toBe(403)
  })

  it("cannot revoke another household's invite", async () => {
    const other = await createMember()
    const { body } = await send('POST', '/household/invites', undefined, { as: other })

    expect((await send('DELETE', `/household/invites/${body.id}`)).status).toBe(404)
  })
})

describe('POST /household/join', () => {
  it('joins the household as a member, however the code is typed', async () => {
    const code = await invite()
    const user = await createUser()

    const response = await send(
      'POST',
      '/household/join',
      { code: ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4)} ` },
      { as: user }
    )

    expect(response).toMatchObject({ status: 200, body: { id: defaultMember().householdId } })
    expect(response.body.members).toContainEqual(expect.objectContaining({ userId: user.userId, role: 'member' }))
    expect((await send('GET', '/recipes', undefined, { as: user })).status).toBe(200)
  })

  it('uses up the code', async () => {
    const code = await invite()
    await send('POST', '/household/join', { code }, { as: await createUser() })

    expect(await send('POST', '/household/join', { code }, { as: await createUser() })).toMatchObject({
      status: 404,
      body: { error: { code: 'not_found' } }
    })
  })

  it('returns 404 for an expired code', async () => {
    const code = await invite()
    await DB.query(`UPDATE household_invites SET expires_at = NOW() - INTERVAL '1 second'`)

    expect((await send('POST', '/household/join', { code }, { as: await createUser() })).status).toBe(404)
  })

  it('returns 400 for something that is not a code', async () => {
    expect((await send('POST', '/household/join', { code: 'nope' }, { as: await createUser() })).status).toBe(400)
  })

  it('returns 409 for someone who already has a household, leaving the code unused', async () => {
    const code = await invite()
    const other = await createMember()

    expect((await send('POST', '/household/join', { code }, { as: other })).status).toBe(409)
    expect((await send('GET', '/household/invites')).body).toHaveLength(1)
  })

  it('makes the first person into a household with no members its owner', async () => {
    const householdId = await createHousehold('Home')
    await DB.query(
      `INSERT INTO household_invites (household_id, code, expires_at) VALUES ($1, 'K7QM2XPA', NOW() + INTERVAL '1 day')`,
      [householdId]
    )
    const user = await createUser()

    const response = await send('POST', '/household/join', { code: 'K7QM2XPA' }, { as: user })

    expect(response.body.members).toEqual([expect.objectContaining({ userId: user.userId, role: 'owner' })])
  })
})

describe('PATCH /household/members/:userId', () => {
  it('lets an owner promote a member', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    const response = await send('PATCH', `/household/members/${member.userId}`, { role: 'owner' })

    expect(response.body.members).toContainEqual(expect.objectContaining({ userId: member.userId, role: 'owner' }))
  })

  it('returns 409 for demoting the last owner', async () => {
    expect(await send('PATCH', `/household/members/${defaultMember().userId}`, { role: 'member' })).toMatchObject({
      status: 409,
      body: { error: { code: 'conflict' } }
    })
  })

  it('returns 404 for someone outside the household', async () => {
    const outsider = await createMember()

    expect((await send('PATCH', `/household/members/${outsider.userId}`, { role: 'member' })).status).toBe(404)
  })

  it('returns 403 for a member', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    expect((await send('PATCH', `/household/members/${member.userId}`, { role: 'owner' }, { as: member })).status).toBe(403)
  })
})

describe('DELETE /household/members/:userId', () => {
  it('lets an owner remove a member, who loses access at once', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    expect((await send('DELETE', `/household/members/${member.userId}`)).status).toBe(204)

    expect(await send('GET', '/recipes', undefined, { as: member })).toMatchObject({
      status: 403,
      body: { error: { code: 'no_household' } }
    })
  })

  it('lets a member leave', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    expect((await send('DELETE', `/household/members/${member.userId}`, undefined, { as: member })).status).toBe(204)
    expect((await send('GET', '/me', undefined, { as: member })).body.household).toBeNull()
  })

  it('returns 403 for a member removing someone else', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    expect((await send('DELETE', `/household/members/${defaultMember().userId}`, undefined, { as: member })).status).toBe(
      403
    )
  })

  it('returns 409 for the last owner leaving', async () => {
    expect(await send('DELETE', `/household/members/${defaultMember().userId}`)).toMatchObject({
      status: 409,
      body: { error: { message: expect.stringContaining('Delete the household') } }
    })
  })
})

describe('DELETE /household', () => {
  it('deletes the household and everything in it for an owner', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })
    const { id, ...recipe } = recipeInput()
    await send('PUT', `/recipes/${id}`, recipe)

    expect((await send('DELETE', '/household')).status).toBe(204)

    expect((await send('GET', '/me', undefined, { as: member })).body.household).toBeNull()
    expect(await DB.queryOne(`SELECT 1 FROM recipes WHERE id = $1`, [id])).toBeNull()
  })

  it('returns 403 for a member', async () => {
    const member = await createMember({ householdId: defaultMember().householdId })

    expect((await send('DELETE', '/household', undefined, { as: member })).status).toBe(403)
  })
})
