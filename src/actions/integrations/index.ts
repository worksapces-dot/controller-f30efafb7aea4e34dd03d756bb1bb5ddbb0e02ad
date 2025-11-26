'use server'

import { redirect } from 'next/navigation'
import { onCurrentUser } from '../user'
import { createIntegration, getIntegration } from './queries'
import { generateTokens } from '@/lib/fetch'
import axios from 'axios'

export const onOAuthInstagram = (strategy: 'INSTAGRAM' | 'CRM') => {
  if (strategy === 'INSTAGRAM') {
    const oauthUrl = process.env.INSTAGRAM_EMBEDDED_OAUTH_URL as string
    console.log('🔍 OAuth URL:', oauthUrl)
    
    // Extract redirect_uri from OAuth URL for debugging
    try {
      const url = new URL(oauthUrl)
      const redirectUri = url.searchParams.get('redirect_uri')
      console.log('🔍 Redirect URI in OAuth URL:', redirectUri)
      console.log('🔍 Expected redirect URI:', `${process.env.NEXT_PUBLIC_HOST_URL}/callback/instagram`)
      
      if (redirectUri && redirectUri !== `${process.env.NEXT_PUBLIC_HOST_URL}/callback/instagram`) {
        console.warn('⚠️ WARNING: OAuth redirect_uri does not match NEXT_PUBLIC_HOST_URL!')
        console.warn('⚠️ OAuth has:', redirectUri)
        console.warn('⚠️ Code expects:', `${process.env.NEXT_PUBLIC_HOST_URL}/callback/instagram`)
      }
    } catch (e) {
      console.warn('Could not parse OAuth URL for validation')
    }
    
    return redirect(oauthUrl)
  }
}

export const onIntegrate = async (code: string) => {
  const user = await onCurrentUser()

  try {
    const integration = await getIntegration(user.id)

    // Always exchange the code for a token first
    const token = await generateTokens(code)
    console.log('Token received:', token ? 'Yes' : 'No')

    if (!token || !token.access_token) {
      console.log('🔴 401 - No token or access_token')
      return { status: 401, error: 'No token received' }
    }

    try {
      // For Instagram Graph API, user_id is already in the token response
      const instagramUserId = token.user_id

      if (!instagramUserId) {
        console.error('🔴 No user_id in token response:', token)
        return { status: 500, error: 'No Instagram user ID received' }
      }

      console.log('✅ Instagram user ID:', instagramUserId)

      const today = new Date()
      const expire_date = today.setDate(today.getDate() + 60)

      const igIdString = String(instagramUserId)

      if (!integration || integration.integrations.length === 0) {
        // No existing integration → create a new one
        const created = await createIntegration(
          user.id,
          token.access_token,
          new Date(expire_date),
          igIdString
        )
        console.log('✅ Integration created successfully')
        return { status: 200, data: created }
      }

      // Existing integration → update token + instagramId
      const existing = integration.integrations[0]

      await updateIntegration(
        token.access_token,
        new Date(expire_date),
        existing.id,
        igIdString
      )

      console.log('✅ Integration updated successfully')
      return { status: 200, data: { firstname: user.firstName, lastname: user.lastName } }
    } catch (apiError: any) {
      console.error('🔴 Integration create/update error:', apiError)
      return { status: 500, error: apiError.message || 'Failed to create/update integration' }
    }
  } catch (error: any) {
    console.error('🔴 500 Error in onIntegrate:', error)
    return { status: 500, error: error?.message || 'Unknown error occurred' }
  }
}
