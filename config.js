const SUPABASE_URL = 'https://backdfyzexrdokwmmsax.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhY2tkZnl6ZXhyZG9rd21tc2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDM5MzYsImV4cCI6MjA5NzE3OTkzNn0.rIK39UkiLM4cqVtkX915pG_-eWDBtCLPnxgm8UsgM9M';

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
