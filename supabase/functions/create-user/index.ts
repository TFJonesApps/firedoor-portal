import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function okResponse(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify caller is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Unauthorized', 401)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return errorResponse('Unauthorized', 401)

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') return errorResponse('Forbidden', 403)

    const body = await req.json()
    const { action } = body

    // ── CREATE ──────────────────────────────────────────────────────────────
    if (!action || action === 'create') {
      const { email, password, role, client_id } = body
      if (!email || !password || !role) return errorResponse('email, password and role are required', 400)

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createError) return errorResponse(createError.message, 400)

      await supabaseAdmin.from('user_profiles').insert({
        id:        newUser.user.id,
        email,
        role,
        client_id: client_id || null,
        disabled:  false,
      })

      return okResponse({ success: true, id: newUser.user.id })
    }

    // ── DISABLE ─────────────────────────────────────────────────────────────
    if (action === 'disable') {
      const { user_id } = body
      if (!user_id) return errorResponse('user_id is required', 400)

      await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: '876000h' })
      await supabaseAdmin.from('user_profiles').update({ disabled: true }).eq('id', user_id)

      return okResponse({ success: true })
    }

    // ── ENABLE ──────────────────────────────────────────────────────────────
    if (action === 'enable') {
      const { user_id } = body
      if (!user_id) return errorResponse('user_id is required', 400)

      await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
      await supabaseAdmin.from('user_profiles').update({ disabled: false }).eq('id', user_id)

      return okResponse({ success: true })
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) return errorResponse('user_id is required', 400)

      await supabaseAdmin.from('user_profiles').delete().eq('id', user_id)
      await supabaseAdmin.auth.admin.deleteUser(user_id)

      return okResponse({ success: true })
    }

    return errorResponse('Unknown action', 400)

  } catch (e) {
    return errorResponse(e.message, 500)
  }
})
