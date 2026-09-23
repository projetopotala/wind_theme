import { getSupabaseClient } from "../supabase/client.js";

function rowToState(row) {
  if (!row) return null;
  return {
    visits: row.total_waterings,
    lastDay: row.last_watered_on,
    streak: row.current_streak,
    history: row.watered_days,
  };
}

export function createPlantCareRepository({ client = getSupabaseClient() } = {}) {
  return {
    async session() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data?.session || null;
    },
    async read() {
      const { data, error } = await client.from("plant_care").select("total_waterings,last_watered_on,current_streak,watered_days").maybeSingle();
      if (error) throw error;
      return rowToState(data);
    },
    async save(state) {
      const { data, error } = await client.from("plant_care").upsert({
        total_waterings: state.visits,
        last_watered_on: state.lastDay || null,
        current_streak: state.streak,
        watered_days: state.history,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" }).select("total_waterings,last_watered_on,current_streak,watered_days").single();
      if (error) throw error;
      return rowToState(data);
    },
    onAuthChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => setTimeout(() => callback(session?.user || null), 0));
      return () => data?.subscription?.unsubscribe?.();
    },
  };
}
