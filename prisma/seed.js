// d:/m/medio-backend/prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing records (in reverse dependency order)
  console.log('🧹 Cleaning old records...');
  await prisma.refreshToken.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.pharmacy.deleteMany({});
  await prisma.user.deleteMany({});

  // Hash standard password for accounts ("password123")
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  // 2. Create Users (Jayesh + historical patients)
  console.log('👤 Seeding Users...');
  const usersData = [
    { id: 'usr-jayesh', name: 'Jayesh Harrison', phone: '+919999999999', email: 'jayesh@medio.com', role: 'USER' },
    { id: 'usr-priya', name: 'Priya Mehta', phone: '+919999999901', email: 'priya@medio.com', role: 'USER' },
    { id: 'usr-rajan', name: 'Rajan Kumar', phone: '+919999999902', email: 'rajan@medio.com', role: 'USER' },
    { id: 'usr-sunita', name: 'Sunita Lakshmi', phone: '+919999999903', email: 'sunita@medio.com', role: 'USER' },
    { id: 'usr-anil', name: 'Anil Sharma', phone: '+919999999904', email: 'anil@medio.com', role: 'USER' },
    { id: 'usr-kavita', name: 'Kavita Nair', phone: '+919999999905', email: 'kavita@medio.com', role: 'USER' },
    { id: 'usr-vikram', name: 'Vikram Patel', phone: '+919999999906', email: 'vikram@medio.com', role: 'USER' },
    { id: 'usr-neha', name: 'Neha Gupta', phone: '+919999999907', email: 'neha@medio.com', role: 'USER' },
    { id: 'usr-suresh', name: 'Suresh Reddy', phone: '+919999999908', email: 'suresh@medio.com', role: 'USER' },
    { id: 'usr-meena', name: 'Meena Iyer', phone: '+919999999909', email: 'meena@medio.com', role: 'USER' },
  ];

  const seededUsers = {};
  for (const u of usersData) {
    const user = await prisma.user.create({ data: u });
    seededUsers[u.id] = user;
  }
  console.log(`✅ Seeded ${Object.keys(seededUsers).length} users.`);

  // 2b. Add Address for Jayesh
  await prisma.address.create({
    data: {
      userId: 'usr-jayesh',
      label: 'Home',
      line1: 'Flat 402, Sunshine Heights',
      line2: 'DN Nagar, Andheri West',
      city: 'Mumbai',
      pincode: '400053',
      lat: 19.1235,
      lng: 72.8258,
      isDefault: true,
    }
  });

  // 3. Create Pharmacies
  console.log('🏪 Seeding Pharmacies...');
  const pharmaciesData = [
    {
      id: 'ph1',
      name: 'MedPlus Pharmacy',
      licenseNo: 'LIC-MH-100201',
      phone: '+919876543210',
      passwordHash,
      role: 'PHARMACY',
      isOnline: true,
      isVerified: true,
      lat: 19.1215,
      lng: 72.8268,
      addressLine: 'Shop 12, DN Nagar, Andheri West',
      city: 'Mumbai',
      pincode: '400053',
      coverageKm: 3.0,
    },
    {
      id: 'ph2',
      name: 'Apollo Pharmacy',
      licenseNo: 'LIC-MH-100202',
      phone: '+919876543211',
      passwordHash,
      role: 'PHARMACY',
      isOnline: true,
      isVerified: true,
      lat: 19.1180,
      lng: 72.8220,
      addressLine: '14, Lokhandwala Complex, Andheri West',
      city: 'Mumbai',
      pincode: '400053',
      coverageKm: 3.0,
    },
    {
      id: 'ph3',
      name: 'Wellness Forever',
      licenseNo: 'LIC-MH-100203',
      phone: '+919876543212',
      passwordHash,
      role: 'PHARMACY',
      isOnline: true,
      isVerified: true,
      lat: 19.1245,
      lng: 72.8310,
      addressLine: '7, JP Road, Versova, Andheri West',
      city: 'Mumbai',
      pincode: '400061',
      coverageKm: 2.5,
    },
    {
      id: 'ph4',
      name: 'NetMeds Store',
      licenseNo: 'LIC-MH-100204',
      phone: '+919876543213',
      passwordHash,
      role: 'PHARMACY',
      isOnline: false,
      isVerified: true,
      lat: 19.1110,
      lng: 72.8180,
      addressLine: '22, SVP Road, Andheri West',
      city: 'Mumbai',
      pincode: '400053',
      coverageKm: 3.5,
    },
    {
      id: 'ph5',
      name: 'HealthKart Pharmacy',
      licenseNo: 'LIC-MH-100205',
      phone: '+919876543214',
      passwordHash,
      role: 'PHARMACY',
      isOnline: true,
      isVerified: true,
      lat: 19.1150,
      lng: 72.8290,
      addressLine: '5, Four Bungalows, Andheri West',
      city: 'Mumbai',
      pincode: '400053',
      coverageKm: 2.0,
    },
    {
      id: 'ph6',
      name: 'MediBuddy Express',
      licenseNo: 'LIC-MH-100206',
      phone: '+919876543215',
      passwordHash,
      role: 'PHARMACY',
      isOnline: true,
      isVerified: true,
      lat: 19.1260,
      lng: 72.8340,
      addressLine: '31, Yari Road, Versova',
      city: 'Mumbai',
      pincode: '400061',
      coverageKm: 3.0,
    },
  ];

  for (const ph of pharmaciesData) {
    await prisma.pharmacy.create({ data: ph });
  }
  console.log(`✅ Seeded ${pharmaciesData.length} pharmacies.`);

  // 4. Create Rider
  console.log('🚴 Seeding Rider...');
  const rider = await prisma.rider.create({
    data: {
      id: 'rdr-rahul',
      name: 'Rahul S.',
      phone: '+918888888888',
      passwordHash,
      role: 'RIDER',
      isAvailable: true,
      lat: 19.1220,
      lng: 72.8260,
    }
  });
  console.log('✅ Seeded Rider.');

  // 5. Seed Order History (For dynamic statistics and history tabs)
  console.log('📦 Seeding Order History...');
  const now = new Date();
  const daysAgo = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  const ordersData = [
    {
      id: 'MED-77234',
      type: 'RX',
      status: 'DELIVERED',
      userId: 'usr-priya',
      pharmacyId: 'ph1',
      riderId: 'rdr-rahul',
      rxImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnXySYeC0CbtGL9ft5GZjQAHxhK2Y9C2E19_1JACjS1swMqwWXNSlrHU1zt7B0BbsyncKvS6bMy_r7tE3tgihWQGDG9qxvub6UjXY3YfDBloQ9C6-Ra57wbaDwG8wHPn7xtlEag9S9EeQtLBGsgAQAvEnME539KZVJV4pyEWWCyIxNdcIpUqlco_IUtz0d72-kw5t61a0sdIkXDS-Gvdolj1ieWjCQZ87WgcvXigYfLNLNTP2vX2g075SJY9X6KfuJcXLw4Axf1IY',
      items: [
        { name: 'Amoxicillin 500mg', qty: 21, dosage: 'Three times daily', inStock: true },
        { name: 'Fluticasone Propionate Nasal Spray', qty: 1, dosage: 'Once daily', inStock: true }
      ],
      deliveryLat: 19.1230,
      deliveryLng: 72.8265,
      deliveryAddress: 'Shop 12, DN Nagar, Andheri West',
      flashExpiresAt: daysAgo(0),
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2h ago
      subtotalPaise: 30000,
      deliveryPaise: 4000,
      totalPaise: 34000, // ₹340
      acceptedAt: new Date(now.getTime() - 110 * 60 * 1000),
      packedAt: new Date(now.getTime() - 100 * 60 * 1000),
      deliveredAt: new Date(now.getTime() - 80 * 60 * 1000),
    },
    {
      id: 'MED-66912',
      type: 'OTC',
      status: 'DELIVERED',
      userId: 'usr-rajan',
      pharmacyId: 'ph1',
      riderId: 'rdr-rahul',
      items: [
        { name: 'Crocin Advance 500mg', qty: 2, dosage: 'SOS', inStock: true },
        { name: 'Vicks VapoRub 50g', qty: 1, dosage: 'External use', inStock: true }
      ],
      deliveryLat: 19.1170,
      deliveryLng: 72.8210,
      deliveryAddress: '14, Lokhandwala Complex, Andheri West',
      flashExpiresAt: daysAgo(0),
      createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5h ago
      subtotalPaise: 17500,
      deliveryPaise: 4000,
      totalPaise: 21500, // ₹215
      acceptedAt: new Date(now.getTime() - 290 * 60 * 1000),
      packedAt: new Date(now.getTime() - 280 * 60 * 1000),
      deliveredAt: new Date(now.getTime() - 260 * 60 * 1000),
    },
    {
      id: 'MED-55438',
      type: 'RX',
      status: 'DELIVERED',
      userId: 'usr-sunita',
      pharmacyId: 'ph1',
      riderId: 'rdr-rahul',
      rxImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnXySYeC0CbtGL9ft5GZjQAHxhK2Y9C2E19_1JACjS1swMqwWXNSlrHU1zt7B0BbsyncKvS6bMy_r7tE3tgihWQGDG9qxvub6UjXY3YfDBloQ9C6-Ra57wbaDwG8wHPn7xtlEag9S9EeQtLBGsgAQAvEnME539KZVJV4pyEWWCyIxNdcIpUqlco_IUtz0d72-kw5t61a0sdIkXDS-Gvdolj1ieWjCQZ87WgcvXigYfLNLNTP2vX2g075SJY9X6KfuJcXLw4Axf1IY',
      items: [
        { name: 'Metformin 500mg', qty: 60, dosage: 'Twice daily with meals', inStock: true },
        { name: 'Atorvastatin 10mg', qty: 30, dosage: 'Once daily at bedtime', inStock: true }
      ],
      deliveryLat: 19.1220,
      deliveryLng: 72.8290,
      deliveryAddress: 'Flat 101, Sea Breeze, Versova',
      flashExpiresAt: daysAgo(1),
      createdAt: new Date(now.getTime() - 28 * 60 * 60 * 1000), // Yesterday
      subtotalPaise: 52000,
      deliveryPaise: 4000,
      totalPaise: 56000, // ₹560
      acceptedAt: new Date(now.getTime() - 27.8 * 60 * 60 * 1000),
      packedAt: new Date(now.getTime() - 27.5 * 60 * 60 * 1000),
      deliveredAt: new Date(now.getTime() - 27 * 60 * 60 * 1000),
    },
    {
      id: 'MED-44201',
      type: 'OTC',
      status: 'CANCELLED',
      userId: 'usr-anil',
      pharmacyId: 'ph1',
      items: [
        { name: 'Dolo 650mg Tabs', qty: 3, dosage: 'SOS', inStock: true }
      ],
      deliveryLat: 19.1120,
      deliveryLng: 72.8190,
      deliveryAddress: '22, SVP Road, Andheri West',
      flashExpiresAt: daysAgo(1),
      createdAt: new Date(now.getTime() - 32 * 60 * 60 * 1000), // Yesterday
      subtotalPaise: 9000,
      deliveryPaise: 3000,
      totalPaise: 12000, // ₹120
      cancelledAt: new Date(now.getTime() - 31.9 * 60 * 60 * 1000),
    },
    {
      id: 'MED-33109',
      type: 'RX',
      status: 'DELIVERED',
      userId: 'usr-kavita',
      pharmacyId: 'ph1',
      riderId: 'rdr-rahul',
      rxImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnXySYeC0CbtGL9ft5GZjQAHxhK2Y9C2E19_1JACjS1swMqwWXNSlrHU1zt7B0BbsyncKvS6bMy_r7tE3tgihWQGDG9qxvub6UjXY3YfDBloQ9C6-Ra57wbaDwG8wHPn7xtlEag9S9EeQtLBGsgAQAvEnME539KZVJV4pyEWWCyIxNdcIpUqlco_IUtz0d72-kw5t61a0sdIkXDS-Gvdolj1ieWjCQZ87WgcvXigYfLNLNTP2vX2g075SJY9X6KfuJcXLw4Axf1IY',
      items: [
        { name: 'Azithromycin 250mg', qty: 6, dosage: 'Once daily for 5 days', inStock: true },
        { name: 'Montelukast 10mg', qty: 15, dosage: 'Once daily in evening', inStock: true },
        { name: 'Cetirizine 10mg', qty: 10, dosage: 'Once daily SOS', inStock: true }
      ],
      deliveryLat: 19.1250,
      deliveryLng: 72.8330,
      deliveryAddress: '31, Yari Road, Versova',
      flashExpiresAt: daysAgo(2),
      createdAt: daysAgo(2), // 26 May
      subtotalPaise: 85000,
      deliveryPaise: 4000,
      totalPaise: 89000, // ₹890
      acceptedAt: new Date(daysAgo(2).getTime() + 10 * 60000),
      packedAt: new Date(daysAgo(2).getTime() + 25 * 60000),
      deliveredAt: new Date(daysAgo(2).getTime() + 50 * 60000),
    },
    {
      id: 'MED-22887',
      type: 'OTC',
      status: 'DELIVERED',
      userId: 'usr-vikram',
      pharmacyId: 'ph1',
      riderId: 'rdr-rahul',
      items: [
        { name: 'Volini Spray 40g', qty: 1, dosage: 'External use', inStock: true },
        { name: 'Band-Aid Pack', qty: 1, dosage: 'First aid', inStock: true }
      ],
      deliveryLat: 19.1240,
      deliveryLng: 72.8270,
      deliveryAddress: 'DN Nagar Metro Station, Andheri',
      flashExpiresAt: daysAgo(2),
      createdAt: daysAgo(2),
      subtotalPaise: 34000,
      deliveryPaise: 4000,
      totalPaise: 38000, // ₹380
      acceptedAt: new Date(daysAgo(2).getTime() + 5 * 60000),
      packedAt: new Date(daysAgo(2).getTime() + 15 * 60000),
      deliveredAt: new Date(daysAgo(2).getTime() + 35 * 60000),
    },
    {
      id: 'MED-11765',
      type: 'RX',
      status: 'CANCELLED',
      userId: 'usr-neha',
      pharmacyId: 'ph1',
      items: [
        { name: 'Insulin Glargine 100 IU/ml', qty: 1, dosage: '10 units daily', inStock: true }
      ],
      deliveryLat: 19.1140,
      deliveryLng: 72.8280,
      deliveryAddress: '4, Four Bungalows, Andheri West',
      flashExpiresAt: daysAgo(3),
      createdAt: daysAgo(3), // 25 May
      subtotalPaise: 121000,
      deliveryPaise: 4000,
      totalPaise: 125000, // ₹1250
      cancelledAt: new Date(daysAgo(3).getTime() + 12 * 60000),
    },
    {
      id: 'MED-99654',
      type: 'OTC',
      status: 'DELIVERED',
      userId: 'usr-suresh',
      pharmacyId: 'ph1',
      riderId: 'rdr-rahul',
      items: [
        { name: 'Combiflam Tabs', qty: 1, dosage: 'SOS', inStock: true },
        { name: 'ORS Sachets', qty: 5, dosage: 'Dilute in 1L water', inStock: true }
      ],
      deliveryLat: 19.1270,
      deliveryLng: 72.8350,
      deliveryAddress: 'JP Road, Seven Bungalows',
      flashExpiresAt: daysAgo(3),
      createdAt: daysAgo(3),
      subtotalPaise: 13500,
      deliveryPaise: 4000,
      totalPaise: 17500, // ₹175
      acceptedAt: new Date(daysAgo(3).getTime() + 8 * 60000),
      packedAt: new Date(daysAgo(3).getTime() + 20 * 60000),
      deliveredAt: new Date(daysAgo(3).getTime() + 45 * 60000),
    },
    {
      id: 'MED-88543',
      type: 'RX',
      status: 'DELIVERED',
      userId: 'usr-meena',
      pharmacyId: 'ph1',
      riderId: 'rdr-rahul',
      rxImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnXySYeC0CbtGL9ft5GZjQAHxhK2Y9C2E19_1JACjS1swMqwWXNSlrHU1zt7B0BbsyncKvS6bMy_r7tE3tgihWQGDG9qxvub6UjXY3YfDBloQ9C6-Ra57wbaDwG8wHPn7xtlEag9S9EeQtLBGsgAQAvEnME539KZVJV4pyEWWCyIxNdcIpUqlco_IUtz0d72-kw5t61a0sdIkXDS-Gvdolj1ieWjCQZ87WgcvXigYfLNLNTP2vX2g075SJY9X6KfuJcXLw4Axf1IY',
      items: [
        { name: 'Losartan 50mg', qty: 30, dosage: 'Once daily', inStock: true },
        { name: 'Amlodipine 5mg', qty: 30, dosage: 'Once daily', inStock: true }
      ],
      deliveryLat: 19.1190,
      deliveryLng: 72.8250,
      deliveryAddress: 'Laxmi Industrial Estate, Andheri',
      flashExpiresAt: daysAgo(4),
      createdAt: daysAgo(4), // 24 May
      subtotalPaise: 38000,
      deliveryPaise: 4000,
      totalPaise: 42000, // ₹420
      acceptedAt: new Date(daysAgo(4).getTime() + 15 * 60000),
      packedAt: new Date(daysAgo(4).getTime() + 30 * 60000),
      deliveredAt: new Date(daysAgo(4).getTime() + 55 * 60000),
    },
  ];

  for (const ord of ordersData) {
    await prisma.order.create({ data: ord });
  }
  console.log(`✅ Seeded ${ordersData.length} historical orders.`);

  console.log('🎉 Seeding successfully completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
