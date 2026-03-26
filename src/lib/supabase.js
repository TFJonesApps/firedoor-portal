import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://ztagewwelwgrhmibikcv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0YWdld3dlbHdncmhtaWJpa2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTMzNDQsImV4cCI6MjA5MDAyOTM0NH0.cC8_Ltldb4fRB9nHNCNCZIN2N7R_cD1WIFP6oMVyrG8'
)
