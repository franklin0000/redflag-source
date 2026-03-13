// Point all old shim imports to the real Supabase client
export { supabase } from '../lib/supabase.js';

export async function uploadToSupabase(bucket, path, file) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicData.publicUrl;
}
