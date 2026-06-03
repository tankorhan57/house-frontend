import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://gkkeotvnwbvoueqeuapq.supabase.co";
const supabaseAnonKey = "sb_publishable_vc6QCM51SST7TchsU-SbFg_uRrC7Gpi";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
