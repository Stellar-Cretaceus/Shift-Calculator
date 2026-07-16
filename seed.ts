import 'dotenv/config';
import { db } from './lib/db'; // Make sure this path points to your Drizzle db setup
import { holidays } from './lib/db/schema';
import holidayData from './2026.json';

async function main() {
  console.log(' Starting database seed...');

  try {
    // 1. Map the JSON data to match our schema columns
    const insertData = holidayData.holidays.map((h) => ({
      date: h.date,
      name: h.name_th, // Grabbing the Thai name specifically
    }));

    // 2. Dump it into Neon! 
    // .onConflictDoNothing ensures that if you run this twice by accident, it won't crash or create duplicates.
    await db.insert(holidays)
      .values(insertData)
      .onConflictDoNothing({ target: holidays.date });

    console.log(`Successfully seeded ${insertData.length} holidays into the database!`);
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    // 3. Close the script
    process.exit(0);
  }
}

main();