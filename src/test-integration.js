// src/test-integration.js
// Integration test script to verify JWT auth, OTP flow, order creation, and Socket.io events.
// Execute in terminal with: node src/test-integration.js

import { io } from 'socket.io-client';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:4000';

async function runTests() {
  console.log('🧪 Starting integration tests for Medio Backend...');

  try {
    // 1. Check health
    console.log('\nStep 1: Checking API Health...');
    const health = await axios.get(`${BACKEND_URL}/health`);
    console.log('✅ Health response:', health.data);

    // 2. Request OTP
    console.log('\nStep 2: Simulating User Requesting OTP...');
    const phone = '9876543210';
    const otpRes = await axios.post(`${BACKEND_URL}/api/auth/user/request-otp`, { phone });
    console.log('✅ OTP Request response:', otpRes.data);

    // 3. Verify OTP (using development mock '123456')
    console.log('\nStep 3: Verifying OTP (with mock 123456 in dev)...');
    const verifyRes = await axios.post(`${BACKEND_URL}/api/auth/user/verify-otp`, {
      phone,
      otp: '123456',
      name: 'John Doe'
    });
    console.log('✅ OTP Verification response:', verifyRes.data);
    const userToken = verifyRes.data.accessToken;

    // 4. Register Pharmacy
    console.log('\nStep 4: Registering a test Pharmacy...');
    const pharmPhone = '9999888877';
    let pharmToken;
    try {
      const pharmReg = await axios.post(`${BACKEND_URL}/api/auth/pharmacy/register`, {
        name: 'City Pharmacy',
        licenseNo: 'LIC-778899-2026',
        phone: pharmPhone,
        password: 'password123',
        lat: 12.9716, // Bangalore coordinates
        lng: 77.5946
      });
      console.log('✅ Pharmacy registered successfully.');
      pharmToken = pharmReg.data.accessToken;
    } catch (err) {
      if (err.response && err.response.status === 409) {
        console.log('ℹ️ Pharmacy already exists, attempting login...');
        const pharmLog = await axios.post(`${BACKEND_URL}/api/auth/pharmacy/login`, {
          phone: pharmPhone,
          password: 'password123'
        });
        console.log('✅ Pharmacy logged in successfully.');
        pharmToken = pharmLog.data.accessToken;
      } else {
        throw err;
      }
    }

    // 5. Connect Sockets
    console.log('\nStep 5: Testing WebSocket Handshake Authentication...');
    const userSocket = io(BACKEND_URL, {
      auth: { token: `Bearer ${userToken}` }
    });

    const pharmSocket = io(BACKEND_URL, {
      auth: { token: `Bearer ${pharmToken}` }
    });

    userSocket.on('connect', () => console.log('🟢 User WebSocket connected.'));
    pharmSocket.on('connect', () => console.log('🟢 Pharmacy WebSocket connected.'));

    pharmSocket.on('FLASH_PING', (data) => {
      console.log('⚡ [SOCKET EVENT] Pharmacy received FLASH_PING:', data);
      
      // Auto-accept the order in the test!
      console.log('🤝 Simulating Pharmacy accepting flash ping...');
      pharmSocket.emit('PHARMACY_ACCEPT', { orderId: data.orderId }, (res) => {
        console.log('🏁 [RACE RESULT] Accept response from server:', res);
        
        // Mark as packed
        setTimeout(() => {
          console.log('📦 Simulating Pharmacy marking order as packed...');
          pharmSocket.emit('PHARMACY_PACKED', { orderId: data.orderId });
        }, 1000);
      });
    });

    userSocket.on('ORDER_ACCEPTED', (data) => {
      console.log('🎉 [SOCKET EVENT] User received ORDER_ACCEPTED notification:', data);
    });

    userSocket.on('ORDER_READY', (data) => {
      console.log('🛵 [SOCKET EVENT] User received ORDER_READY for pickup:', data);
      console.log('\n💯 Integration test successfully executed!');
      
      // Close socket connections
      userSocket.disconnect();
      pharmSocket.disconnect();
    });

    // 6. Create prescription order (supports local fallback disk uploading)
    console.log('\nStep 6: Creating user Prescription Order...');
    setTimeout(async () => {
      try {
        const orderRes = await axios.post(
          `${BACKEND_URL}/api/orders`,
          {
            type: 'RX',
            items: JSON.stringify([{ name: 'Paracetamol', qty: 2, dosage: '500mg' }]),
            deliveryLat: 12.9720, // 40m distance from pharmacy (within 3km radius)
            deliveryLng: 77.5950,
            deliveryAddress: 'UB City, Bangalore'
          },
          {
            headers: { Authorization: `Bearer ${userToken}` }
          }
        );
        console.log('✅ Order creation response:', orderRes.data);
      } catch (err) {
        console.error('❌ Order placement failed:', err.response ? err.response.data : err.message);
      }
    }, 1500);

  } catch (error) {
    console.error('❌ Test failed with error:', error.response ? error.response.data : error.message);
  }
}

// Check if running directly
runTests();
