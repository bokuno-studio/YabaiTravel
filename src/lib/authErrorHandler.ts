import type { PostgrestError, AuthError, SupabaseClient } from '@supabase/supabase-js'

/**
 * 認証エラーを検知する
 * - PGRST301: Refresh Token Not Found
 * - AuthApiError: Invalid Refresh Token（ただし他のエラーと区別）
 */
export function isAuthError(error: PostgrestError | AuthError | null | undefined): boolean {
  if (!error) return false

  // PostgreSQL/RLS エラー（PGRST301）
  if ('code' in error && error.code === 'PGRST301') {
    return true
  }

  // Supabase Auth エラー（Invalid Refresh Token など）
  // ただし、一時的なネットワークエラーは対象外
  if ('message' in error && typeof error.message === 'string') {
    const msg = error.message.toLowerCase()
    if ((msg.includes('invalid refresh token') || msg.includes('refresh token not found')) &&
        !msg.includes('network') && !msg.includes('timeout')) {
      return true
    }
  }

  return false
}

/**
 * 認証エラーハンドリング
 * - supabase.auth.signOut() を呼んでセッションクリア
 * - コンソール出力を抑制（静かに処理）
 * - 呼び出し側は再ログイン誘導など処理
 */
export async function handleAuthError(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    // signOut 失敗時も無視（既にセッション無効の可能性）
  }
}

/**
 * Supabase API 呼び出しのエラーハンドリング
 * 認証エラー時は自動でサインアウト
 */
export async function handleSupabaseError(
  error: PostgrestError | AuthError | null | undefined,
  supabase: SupabaseClient,
): Promise<boolean> {
  if (!isAuthError(error)) {
    return false
  }

  // 認証エラーをサイレントに処理
  await handleAuthError(supabase)
  return true
}
