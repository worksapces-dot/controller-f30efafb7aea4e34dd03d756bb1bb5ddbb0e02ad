import axios from 'axios'

export const refreshToken = async (token: string) => {
  const refresh_token = await axios.get(
    `${process.env.INSTAGRAM_BASE_URL}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
  )

  return refresh_token.data
}

export const sendDM = async (
  userId: string,
  recieverId: string,
  prompt: string,
  token: string
) => {
  console.log('sending message')
  return await axios.post(
    `${process.env.INSTAGRAM_BASE_URL}/v21.0/${userId}/messages`,
    {
      recipient: {
        id: recieverId,
      },
      message: {
        text: prompt,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )
}

export const sendPrivateMessage = async (
  userId: string,
  recieverId: string,
  prompt: string,
  token: string
) => {
  console.log('sending message')
  return await axios.post(
    `${process.env.INSTAGRAM_BASE_URL}/${userId}/messages`,
    {
      recipient: {
        comment_id: recieverId,
      },
      message: {
        text: prompt,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )
}


export const generateTokens = async (code: string) => {
  // Extract redirect_uri from OAuth URL to ensure they match exactly
  // This is critical - Instagram requires the redirect_uri to be identical
  let redirectUri: string
  
  try {
    const oauthUrl = process.env.INSTAGRAM_EMBEDDED_OAUTH_URL as string
    const url = new URL(oauthUrl)
    const extractedRedirectUri = url.searchParams.get('redirect_uri')
    
    if (extractedRedirectUri) {
      redirectUri = extractedRedirectUri
      console.log('🔍 Using redirect_uri from OAuth URL:', redirectUri)
    } else {
      // Fallback to NEXT_PUBLIC_HOST_URL if not found in OAuth URL
      redirectUri = `${process.env.NEXT_PUBLIC_HOST_URL}/callback/instagram`.replace(/\/+$/, '')
      console.warn('⚠️ Redirect URI not found in OAuth URL, using NEXT_PUBLIC_HOST_URL:', redirectUri)
    }
  } catch (error) {
    // Fallback to NEXT_PUBLIC_HOST_URL if OAuth URL parsing fails
    redirectUri = `${process.env.NEXT_PUBLIC_HOST_URL}/callback/instagram`.replace(/\/+$/, '')
    console.warn('⚠️ Could not parse OAuth URL, using NEXT_PUBLIC_HOST_URL:', redirectUri)
  }
  
  console.log('🔍 Final redirect_uri:', redirectUri)
  
  const insta_form = new FormData()
  insta_form.append('client_id', process.env.INSTAGRAM_CLIENT_ID as string)

  insta_form.append(
    'client_secret',
    process.env.INSTAGRAM_CLIENT_SECRET as string
  )
  insta_form.append('grant_type', 'authorization_code')
  insta_form.append('redirect_uri', redirectUri)
  insta_form.append('code', code)

  console.log('🔍 Token URL:', process.env.INSTAGRAM_TOKEN_URL)
  
  const shortTokenRes = await fetch(process.env.INSTAGRAM_TOKEN_URL as string, {
    method: 'POST',
    body: insta_form,
  })

  // Check if the response is OK
  if (!shortTokenRes.ok) {
    const errorData = await shortTokenRes.json().catch(() => ({}))
    console.error('🔴 Instagram token request failed:', errorData)
    console.error('🔴 Redirect URI used:', redirectUri)
    console.error('🔴 Make sure this EXACTLY matches the redirect URI in Facebook Business settings!')
    
    // Provide more helpful error message for redirect_uri mismatch
    if (errorData.error_message && errorData.error_message.includes('redirect_uri')) {
      throw new Error(
        `Redirect URI mismatch!\n` +
        `Used: ${redirectUri}\n` +
        `Expected: (check Facebook Business settings)\n` +
        `Error: ${errorData.error_message}`
      )
    }
    
    throw new Error(`Failed to get Instagram token: ${shortTokenRes.status} - ${errorData.error_message || 'Unknown error'}`)
  }

  const token = await shortTokenRes.json()
  
  // Check if token has error
  if (token.error) {
    console.error('Instagram API error:', token)
    throw new Error(token.error.message || 'Instagram API error')
  }

  // Check if access_token exists
  if (!token.access_token) {
    console.error('No access_token in response:', token)
    throw new Error('No access_token received from Instagram')
  }

  // Check permissions safely - permissions might not exist in all Instagram API responses
  const hasPermissions = token.permissions && Array.isArray(token.permissions) && token.permissions.length > 0
  
  if (hasPermissions || token.access_token) {
    console.log(token, 'got token', hasPermissions ? 'with permissions' : 'without permissions')
    
    // Instagram Graph API (business accounts) tokens don't need exchange
    // The access_token received is already a long-lived token (60 days)
    // Token exchange is only for Instagram Basic Display API (personal accounts)
    console.log('✅ Using Instagram Graph API token (already long-lived)')
    return token
  }
  
  console.error('Invalid token response:', token)
  throw new Error('Invalid token response from Instagram')
}
