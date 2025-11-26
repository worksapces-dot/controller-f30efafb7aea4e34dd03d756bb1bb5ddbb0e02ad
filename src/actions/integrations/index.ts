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

    if (integration && integration.integrations.length === 0) {
      const token = await generateTokens(code)
      console.log('Token received:', token ? 'Yes' : 'No')

      if (token && token.access_token) {
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
          
          // Convert user_id to string (database expects String, API returns Int)
          const create = await createIntegration(
            user.id,
            token.access_token,
            new Date(expire_date),
            String(instagramUserId)
          )
          
          console.log('✅ Integration created successfully')
          return { status: 200, data: create }
        } catch (apiError: any) {
          console.error('🔴 Integration creation error:', apiError)
          return { status: 500, error: apiError.message || 'Failed to create integration' }
        }
      }
      console.log('🔴 401 - No token or access_token')
      return { status: 401, error: 'No token received' }
    }
    console.log('🔴 404 - Integration already exists')
    return { status: 404 }
  } catch (error: any) {
    console.error('🔴 500 Error in onIntegrate:', error)
    return { status: 500, error: error?.message || 'Unknown error occurred' }
  }
}
