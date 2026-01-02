import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scan2card';

// Define a minimal schema for migration purposes to avoid validation errors
// We need strict: false to access the old fields that might be removed from the main schema
const MigrationLeadSchema = new mongoose.Schema({
    details: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, { strict: false });

const LeadModel = mongoose.model('Lead_Migration', MigrationLeadSchema, 'leads');

async function migrateLeads() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        console.log('🔍 Finding leads to migrate...');
        // Find leads that might have old string fields
        const leads = await LeadModel.find({}).lean();

        console.log(`📊 Found ${leads.length} total leads. Checking for migration needs...`);

        let updatedCount = 0;
        let errorsCount = 0;

        for (const lead of leads) {
            try {
                const details = (lead as any).details || {};
                let needsUpdate = false;
                const updates: any = {};
                const unsets: any = {};

                // Initialize arrays if they don't exist
                let emails: string[] = Array.isArray(details.emails) ? details.emails : [];
                let phoneNumbers: string[] = Array.isArray(details.phoneNumbers) ? details.phoneNumbers : [];

                // Check for legacy email string
                if (details.email && typeof details.email === 'string' && details.email.trim() !== '') {
                    const email = details.email.trim();
                    if (!emails.includes(email)) {
                        emails.push(email);
                        console.log(`[Lead ${lead._id}] Moving email "${email}" to array`);
                    }
                    // Mark old field for deletion
                    unsets['details.email'] = "";
                    needsUpdate = true;
                }

                // Check for legacy phoneNumber string
                if (details.phoneNumber && typeof details.phoneNumber === 'string' && details.phoneNumber.trim() !== '') {
                    const phone = details.phoneNumber.trim();
                    if (!phoneNumbers.includes(phone)) {
                        phoneNumbers.push(phone);
                        console.log(`[Lead ${lead._id}] Moving phone "${phone}" to array`);
                    }
                    // Mark old field for deletion
                    unsets['details.phoneNumber'] = "";
                    needsUpdate = true;
                }

                // If we found data to migrate
                if (needsUpdate) {
                    // Update arrays
                    updates['details.emails'] = emails;
                    updates['details.phoneNumbers'] = phoneNumbers;

                    // Perform update
                    await LeadModel.updateOne(
                        { _id: lead._id },
                        {
                            $set: updates,
                            $unset: unsets
                        }
                    );
                    updatedCount++;
                }
            } catch (err: any) {
                console.error(`❌ Error migrating lead ${lead._id}:`, err.message);
                errorsCount++;
            }
        }

        console.log('--------------------------------------------------');
        console.log(`✅ Migration completed.`);
        console.log(`Total Leads Processed: ${leads.length}`);
        console.log(`Updated Leads: ${updatedCount}`);
        console.log(`Errors: ${errorsCount}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected.');
    }
}

migrateLeads();
