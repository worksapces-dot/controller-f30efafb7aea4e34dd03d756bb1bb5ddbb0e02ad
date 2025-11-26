'use server'

import { onCurrentUser } from '../user'
import { findUser } from '../user/queries'
import { refreshToken } from '@/lib/fetch'
import { updateIntegration } from '../integrations/queries'
import {
  addKeyWord,
  addListener,
  addPost,
  addTrigger,
  createAutomation,
  deleteKeywordQuery,
  findAutomation,
  getAutomations,
  updateAutomation,
} from './queries'

export const createAutomations = async (id?: string) => {
  const user = await onCurrentUser()
  try {
    const create = await createAutomation(user.id, id)
    if (create) return { status: 200, data: 'Automation created', res: create }

    return { status: 404, data: 'Oops! something went wrong' }
  } catch (error) {
    return { status: 500, data: 'Internal server error' }
  }
}

export const getAllAutomations = async () => {
  const user = await onCurrentUser()
  try {
    const automations = await getAutomations(user.id)
    if (automations) return { status: 200, data: automations.automations }
    return { status: 404, data: [] }
  } catch (error) {
    return { status: 500, data: [] }
  }
}

export const getAutomationInfo = async (id: string) => {
  await onCurrentUser()
  try {
    const automation = await findAutomation(id)
    if (automation) return { status: 200, data: automation }

    return { status: 404 }
  } catch (error) {
    return { status: 500 }
  }
}

export const updateAutomationName = async (
  automationId: string,
  data: {
    name?: string
    active?: boolean
    automation?: string
  }
) => {
  await onCurrentUser()
  try {
    const update = await updateAutomation(automationId, data)
    if (update) {
      return { status: 200, data: 'Automation successfully updated' }
    }
    return { status: 404, data: 'Oops! could not find automation' }
  } catch (error) {
    return { status: 500, data: 'Oops! something went wrong' }
  }
}

export const saveListener = async (
  autmationId: string,
  listener: 'SMARTAI' | 'MESSAGE',
  prompt: string,
  reply?: string
) => {
  await onCurrentUser()
  try {
    const create = await addListener(autmationId, listener, prompt, reply)
    if (create) return { status: 200, data: 'Listener created' }
    return { status: 404, data: 'Cant save listener' }
  } catch (error) {
    return { status: 500, data: 'Oops! something went wrong' }
  }
}

export const saveTrigger = async (automationId: string, trigger: string[]) => {
  await onCurrentUser()
  try {
    const create = await addTrigger(automationId, trigger)
    if (create) return { status: 200, data: 'Trigger saved' }
    return { status: 404, data: 'Cannot save trigger' }
  } catch (error) {
    return { status: 500, data: 'Oops! something went wrong' }
  }
}

export const saveKeyword = async (automationId: string, keyword: string) => {
  await onCurrentUser()
  try {
    const create = await addKeyWord(automationId, keyword)

    if (create) return { status: 200, data: 'Keyword added successfully' }

    return { status: 404, data: 'Cannot add this keyword' }
  } catch (error) {
    return { status: 500, data: 'Oops! something went wrong' }
  }
}

export const deleteKeyword = async (id: string) => {
  await onCurrentUser()
  try {
    const deleted = await deleteKeywordQuery(id)
    if (deleted)
      return {
        status: 200,
        data: 'Keyword deleted',
      }
    return { status: 404, data: 'Keyword not found' }
  } catch (error) {
    return { status: 500, data: 'Oops! something went wrong' }
  }
}

export const getProfilePosts = async () => {
  const user = await onCurrentUser()
  try {
    const profile = await findUser(user.id)

    const integration = profile?.integrations?.[0]

    if (!integration || !integration.token) {
      console.log('🔴 No Instagram integration or missing token for user')
      return { status: 404 }
    }

    // Prefer explicit instagramId if we have it; otherwise fall back to /me/media
    const base = process.env.INSTAGRAM_BASE_URL
    const commonQuery =
      'fields=id,caption,media_url,media_type,timestamp&limit=10&access_token=' +
      integration.token

    const url = integration.instagramId
      ? `${base}/v21.0/${integration.instagramId}/media?${commonQuery}`
      : `${base}/me/media?${commonQuery}`

    const posts = await fetch(url)
    const parsed = await posts.json()

    // If token is expired, try to refresh it once and retry.
    if (parsed?.error?.code === 190) {
      console.log('🔴 Instagram token expired while fetching posts, refreshing...')

      try {
        const refreshed = await refreshToken(integration.token)

        const today = new Date()
        const expire_date = today.setDate(today.getDate() + 60)

        await updateIntegration(
          refreshed.access_token,
          new Date(expire_date),
          integration.id
        )

        const newCommonQuery =
          'fields=id,caption,media_url,media_type,timestamp&limit=10&access_token=' +
          refreshed.access_token

        const retryUrl = integration.instagramId
          ? `${base}/v21.0/${integration.instagramId}/media?${newCommonQuery}`
          : `${base}/me/media?${newCommonQuery}`

        const retry = await fetch(retryUrl)
        const retryParsed = await retry.json()

        if (Array.isArray(retryParsed?.data)) {
          return { status: 200, data: retryParsed.data }
        }

        console.log(
          '🔴 Error in getting posts even after refreshing token:',
          retryParsed
        )
        return { status: 404 }
      } catch (refreshError) {
        console.log('🔴 Failed to refresh Instagram token:', refreshError)
        return { status: 404 }
      }
    }

    // Expected shape: { data: [...] }
    if (Array.isArray(parsed?.data)) {
      return { status: 200, data: parsed.data }
    }

    console.log('🔴 Error in getting posts – unexpected response shape:', parsed)
    return { status: 404 }
  } catch (error) {
    console.log('🔴 server side Error in getting posts ', error)
    return { status: 500 }
  }
}

export const savePosts = async (
  autmationId: string,
  posts: {
    postid: string
    caption?: string
    media: string
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROSEL_ALBUM'
  }[]
) => {
  await onCurrentUser()
  try {
    const create = await addPost(autmationId, posts)

    if (create) return { status: 200, data: 'Posts attached' }

    return { status: 404, data: 'Automation not found' }
  } catch (error) {
    return { status: 500, data: 'Oops! something went wrong' }
  }
}

export const activateAutomation = async (id: string, state: boolean) => {
  await onCurrentUser()
  try {
    const update = await updateAutomation(id, { active: state })
    if (update)
      return {
        status: 200,
        data: `Automation ${state ? 'activated' : 'disabled'}`,
      }
    return { status: 404, data: 'Automation not found' }
  } catch (error) {
    return { status: 500, data: 'Oops! something went wrong' }
  }
}
