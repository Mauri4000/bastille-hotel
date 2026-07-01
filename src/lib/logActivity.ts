import { supabase } from './supabase';

export async function logActivity(
  userId: string | undefined,
  userName: string | undefined,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: string,
) {
  if (!userId) return;
  await supabase.from('activity_log').insert({
    user_id:     userId,
    user_name:   userName ?? 'Desconocido',
    action,
    entity_type: entityType ?? null,
    entity_id:   entityId ?? null,
    details:     details ?? null,
  });
}
