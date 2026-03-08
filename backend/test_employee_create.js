const axios = require('axios');

// Test creating an employee with contact_type
async function testCreateEmployee() {
  try {
    // First, login to get a token
    const loginRes = await axios.post('http://localhost:3000/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log('✓ Logged in successfully');
    
    // Create employee with contact_type
    const employeeData = {
      name: 'Test Employee Contact Type',
      role: 'Sales Clerk',
      contact_type: 'Mobile',
      contact: '09123456789',
      hire_date: '2026-03-05',
      pay_rate: 500,
      employment_status: 'ACTIVE'
    };
    
    console.log('\nCreating employee with data:', employeeData);
    
    const createRes = await axios.post('http://localhost:3000/employees', employeeData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✓ Employee created, ID:', createRes.data.id);
    
    // Fetch the created employee to verify
    const getRes = await axios.get(`http://localhost:3000/employees/${createRes.data.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('\nRetrieved employee data:');
    console.log('  Name:', getRes.data.name);
    console.log('  Role:', getRes.data.role);
    console.log('  Contact Type:', getRes.data.contact_type);
    console.log('  Contact:', getRes.data.contact);
    
    if (getRes.data.contact_type === 'Mobile') {
      console.log('\n✓ SUCCESS: contact_type saved and retrieved correctly!');
    } else {
      console.log('\n✗ FAILED: contact_type is', getRes.data.contact_type, 'instead of "Mobile"');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

testCreateEmployee();
