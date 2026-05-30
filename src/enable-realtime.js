// src/enable-realtime.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📡 Connecting to Supabase database to enable Realtime on "Order" table...');
  try {
    // Execute SQL to add the Order table to the supabase_realtime publication
    await prisma.$executeRawUnsafe(`alter publication supabase_realtime add table "Order";`);
    console.log('✅ Success! Supabase Realtime has been programmatically enabled for the "Order" table.');
  } catch (err) {
    const msg = err.message.toLowerCase();
    if (msg.includes('already active') || msg.includes('already exists') || msg.includes('duplicate') || msg.includes('relation') && msg.includes('already member')) {
      console.log('ℹ️ Realtime replication is already active and configured for the "Order" table.');
    } else {
      console.warn('\n⚠️ Could not automatically toggle via SQL.');
      console.warn('This can occur if the "supabase_realtime" publication is not initialized, or if permission levels differ.');
      console.warn('👉 Please double check and manually toggle the "Order" table under Database -> Replication in your Supabase Dashboard if realtime sync issues occur.\n');
      console.error('Error Details:', err.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
