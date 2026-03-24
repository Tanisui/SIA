function normalize(value) {
  return String(value || '').trim()
}

function slug(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const REGION_LABEL_MAP = {
  NCR: { code: 'NCR', name: 'National Capital Region (NCR)' },
  CAR: { code: 'CAR', name: 'Cordillera Administrative Region (CAR)' },
  'Region I': { code: 'R01', name: 'Region I (Ilocos Region)' },
  'Region II': { code: 'R02', name: 'Region II (Cagayan Valley)' },
  'Region III': { code: 'R03', name: 'Region III (Central Luzon)' },
  'Region IV-A': { code: 'R04A', name: 'Region IV-A (CALABARZON)' },
  'Region IV-B': { code: 'R04B', name: 'Region IV-B (MIMAROPA)' },
  'Region V': { code: 'R05', name: 'Region V (Bicol Region)' },
  'Region VI': { code: 'R06', name: 'Region VI (Western Visayas)' },
  'Region VII': { code: 'R07', name: 'Region VII (Central Visayas)' },
  'Region VIII': { code: 'R08', name: 'Region VIII (Eastern Visayas)' },
  'Region IX': { code: 'R09', name: 'Region IX (Zamboanga Peninsula)' },
  'Region X': { code: 'R10', name: 'Region X (Northern Mindanao)' },
  'Region XI': { code: 'R11', name: 'Region XI (Davao Region)' },
  'Region XII': { code: 'R12', name: 'Region XII (SOCCSKSARGEN)' },
  'Region XIII': { code: 'R13', name: 'Region XIII (Caraga)' },
  BARMM: { code: 'BARMM', name: 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)' }
}

const PH_SEED_REGIONS = Object.values(REGION_LABEL_MAP)

const PROVINCE_ROWS = [
  { name: 'Abra', region_label: 'CAR' },
  { name: 'Agusan del Norte', region_label: 'Region XIII' },
  { name: 'Agusan del Sur', region_label: 'Region XIII' },
  { name: 'Aklan', region_label: 'Region VI' },
  { name: 'Albay', region_label: 'Region V' },
  { name: 'Antique', region_label: 'Region VI' },
  { name: 'Apayao', region_label: 'CAR' },
  { name: 'Aurora', region_label: 'Region III' },
  { name: 'Basilan', region_label: 'BARMM' },
  { name: 'Bataan', region_label: 'Region III' },
  { name: 'Batanes', region_label: 'Region II' },
  { name: 'Batangas', region_label: 'Region IV-A' },
  { name: 'Benguet', region_label: 'CAR' },
  { name: 'Biliran', region_label: 'Region VIII' },
  { name: 'Bohol', region_label: 'Region VII' },
  { name: 'Bukidnon', region_label: 'Region X' },
  { name: 'Bulacan', region_label: 'Region III' },
  { name: 'Cagayan', region_label: 'Region II' },
  { name: 'Camarines Norte', region_label: 'Region V' },
  { name: 'Camarines Sur', region_label: 'Region V' },
  { name: 'Camiguin', region_label: 'Region X' },
  { name: 'Capiz', region_label: 'Region VI' },
  { name: 'Catanduanes', region_label: 'Region V' },
  { name: 'Cavite', region_label: 'Region IV-A' },
  { name: 'Cebu', region_label: 'Region VII' },
  { name: 'Cotabato', region_label: 'Region XII' },
  { name: 'Davao de Oro', region_label: 'Region XI' },
  { name: 'Davao del Norte', region_label: 'Region XI' },
  { name: 'Davao del Sur', region_label: 'Region XI' },
  { name: 'Davao Occidental', region_label: 'Region XI' },
  { name: 'Davao Oriental', region_label: 'Region XI' },
  { name: 'Dinagat Islands', region_label: 'Region XIII' },
  { name: 'Eastern Samar', region_label: 'Region VIII' },
  { name: 'Guimaras', region_label: 'Region VI' },
  { name: 'Ifugao', region_label: 'CAR' },
  { name: 'Ilocos Norte', region_label: 'Region I' },
  { name: 'Ilocos Sur', region_label: 'Region I' },
  { name: 'Iloilo', region_label: 'Region VI' },
  { name: 'Isabela', region_label: 'Region II' },
  { name: 'Kalinga', region_label: 'CAR' },
  { name: 'La Union', region_label: 'Region I' },
  { name: 'Laguna', region_label: 'Region IV-A' },
  { name: 'Lanao del Norte', region_label: 'Region X' },
  { name: 'Lanao del Sur', region_label: 'BARMM' },
  { name: 'Leyte', region_label: 'Region VIII' },
  { name: 'Maguindanao del Norte', region_label: 'BARMM' },
  { name: 'Maguindanao del Sur', region_label: 'BARMM' },
  { name: 'Marinduque', region_label: 'Region IV-B' },
  { name: 'Masbate', region_label: 'Region V' },
  { name: 'Metro Manila', region_label: 'NCR' },
  { name: 'Misamis Occidental', region_label: 'Region X' },
  { name: 'Misamis Oriental', region_label: 'Region X' },
  { name: 'Mountain Province', region_label: 'CAR' },
  { name: 'Negros Occidental', region_label: 'Region VI' },
  { name: 'Negros Oriental', region_label: 'Region VII' },
  { name: 'Northern Samar', region_label: 'Region VIII' },
  { name: 'Nueva Ecija', region_label: 'Region III' },
  { name: 'Nueva Vizcaya', region_label: 'Region II' },
  { name: 'Occidental Mindoro', region_label: 'Region IV-B' },
  { name: 'Oriental Mindoro', region_label: 'Region IV-B' },
  { name: 'Palawan', region_label: 'Region IV-B' },
  { name: 'Pampanga', region_label: 'Region III' },
  { name: 'Pangasinan', region_label: 'Region I' },
  { name: 'Quezon', region_label: 'Region IV-A' },
  { name: 'Quirino', region_label: 'Region II' },
  { name: 'Rizal', region_label: 'Region IV-A' },
  { name: 'Romblon', region_label: 'Region IV-B' },
  { name: 'Samar', region_label: 'Region VIII' },
  { name: 'Sarangani', region_label: 'Region XII' },
  { name: 'Siquijor', region_label: 'Region VII' },
  { name: 'Sorsogon', region_label: 'Region V' },
  { name: 'South Cotabato', region_label: 'Region XII' },
  { name: 'Southern Leyte', region_label: 'Region VIII' },
  { name: 'Sultan Kudarat', region_label: 'Region XII' },
  { name: 'Sulu', region_label: 'BARMM' },
  { name: 'Surigao del Norte', region_label: 'Region XIII' },
  { name: 'Surigao del Sur', region_label: 'Region XIII' },
  { name: 'Tarlac', region_label: 'Region III' },
  { name: 'Tawi-Tawi', region_label: 'BARMM' },
  { name: 'Zambales', region_label: 'Region III' },
  { name: 'Zamboanga del Norte', region_label: 'Region IX' },
  { name: 'Zamboanga del Sur', region_label: 'Region IX' },
  { name: 'Zamboanga Sibugay', region_label: 'Region IX' }
]

const PH_SEED_PROVINCES = PROVINCE_ROWS.map((row) => {
  const region = REGION_LABEL_MAP[row.region_label] || { code: row.region_label, name: row.region_label }
  return {
    code: `PH-${region.code}-${slug(row.name)}`,
    name: normalize(row.name),
    region_code: region.code,
    region_name: region.name
  }
})

const provinceByName = new Map(PH_SEED_PROVINCES.map((province) => [province.name.toLowerCase(), province]))

const CITY_ROWS = [
  { name: 'Quezon City', province_name: 'Metro Manila', type: 'City' },
  { name: 'Manila', province_name: 'Metro Manila', type: 'City' },
  { name: 'Pasig', province_name: 'Metro Manila', type: 'City' },
  { name: 'Makati', province_name: 'Metro Manila', type: 'City' },
  { name: 'Taguig', province_name: 'Metro Manila', type: 'City' },
  { name: 'Caloocan', province_name: 'Metro Manila', type: 'City' },
  { name: 'Las Pinas', province_name: 'Metro Manila', type: 'City' },
  { name: 'Paranaque', province_name: 'Metro Manila', type: 'City' },
  { name: 'Muntinlupa', province_name: 'Metro Manila', type: 'City' },
  { name: 'Marikina', province_name: 'Metro Manila', type: 'City' },
  { name: 'Mandaluyong', province_name: 'Metro Manila', type: 'City' },
  { name: 'San Juan', province_name: 'Metro Manila', type: 'City' },
  { name: 'Valenzuela', province_name: 'Metro Manila', type: 'City' },
  { name: 'Pasay', province_name: 'Metro Manila', type: 'City' },
  { name: 'Cebu City', province_name: 'Cebu', type: 'City' },
  { name: 'Mandaue City', province_name: 'Cebu', type: 'City' },
  { name: 'Lapu-Lapu City', province_name: 'Cebu', type: 'City' },
  { name: 'Tagbilaran City', province_name: 'Bohol', type: 'City' },
  { name: 'Iloilo City', province_name: 'Iloilo', type: 'City' },
  { name: 'Bacolod City', province_name: 'Negros Occidental', type: 'City' },
  { name: 'Dumaguete City', province_name: 'Negros Oriental', type: 'City' },
  { name: 'Tacloban City', province_name: 'Leyte', type: 'City' },
  { name: 'Ormoc City', province_name: 'Leyte', type: 'City' },
  { name: 'Calbayog City', province_name: 'Samar', type: 'City' },
  { name: 'Catbalogan City', province_name: 'Samar', type: 'City' },
  { name: 'Legazpi City', province_name: 'Albay', type: 'City' },
  { name: 'Naga City', province_name: 'Camarines Sur', type: 'City' },
  { name: 'Sorsogon City', province_name: 'Sorsogon', type: 'City' },
  { name: 'Batangas City', province_name: 'Batangas', type: 'City' },
  { name: 'Lipa City', province_name: 'Batangas', type: 'City' },
  { name: 'Calamba City', province_name: 'Laguna', type: 'City' },
  { name: 'Santa Rosa', province_name: 'Laguna', type: 'City' },
  { name: 'Lucena City', province_name: 'Quezon', type: 'City' },
  { name: 'Antipolo', province_name: 'Rizal', type: 'City' },
  { name: 'Cainta', province_name: 'Rizal', type: 'Municipality' },
  { name: 'San Jose del Monte', province_name: 'Bulacan', type: 'City' },
  { name: 'Malolos City', province_name: 'Bulacan', type: 'City' },
  { name: 'Meycauayan', province_name: 'Bulacan', type: 'City' },
  { name: 'Baliuag', province_name: 'Bulacan', type: 'City' },
  { name: 'Angeles City', province_name: 'Pampanga', type: 'City' },
  { name: 'San Fernando', province_name: 'Pampanga', type: 'City' },
  { name: 'Olongapo City', province_name: 'Zambales', type: 'City' },
  { name: 'Baguio City', province_name: 'Benguet', type: 'City' },
  { name: 'Laoag City', province_name: 'Ilocos Norte', type: 'City' },
  { name: 'Vigan City', province_name: 'Ilocos Sur', type: 'City' },
  { name: 'San Fernando', province_name: 'La Union', type: 'City' },
  { name: 'Dagupan', province_name: 'Pangasinan', type: 'City' },
  { name: 'Urdaneta', province_name: 'Pangasinan', type: 'City' },
  { name: 'Alaminos', province_name: 'Pangasinan', type: 'City' },
  { name: 'Tuguegarao City', province_name: 'Cagayan', type: 'City' },
  { name: 'Cauayan City', province_name: 'Isabela', type: 'City' },
  { name: 'Santiago City', province_name: 'Isabela', type: 'City' },
  { name: 'Bayombong', province_name: 'Nueva Vizcaya', type: 'Municipality' },
  { name: 'Cabanatuan City', province_name: 'Nueva Ecija', type: 'City' },
  { name: 'San Jose City', province_name: 'Nueva Ecija', type: 'City' },
  { name: 'Palayan City', province_name: 'Nueva Ecija', type: 'City' },
  { name: 'Tarlac City', province_name: 'Tarlac', type: 'City' },
  { name: 'Puerto Princesa City', province_name: 'Palawan', type: 'City' },
  { name: 'Calapan City', province_name: 'Oriental Mindoro', type: 'City' },
  { name: 'Mamburao', province_name: 'Occidental Mindoro', type: 'Municipality' },
  { name: 'Boac', province_name: 'Marinduque', type: 'Municipality' },
  { name: 'Romblon', province_name: 'Romblon', type: 'Municipality' },
  { name: 'Masbate City', province_name: 'Masbate', type: 'City' },
  { name: 'Cagayan de Oro', province_name: 'Misamis Oriental', type: 'City' },
  { name: 'Iligan City', province_name: 'Lanao del Norte', type: 'City' },
  { name: 'Oroquieta City', province_name: 'Misamis Occidental', type: 'City' },
  { name: 'Malaybalay City', province_name: 'Bukidnon', type: 'City' },
  { name: 'Valencia City', province_name: 'Bukidnon', type: 'City' },
  { name: 'Mambajao', province_name: 'Camiguin', type: 'Municipality' },
  { name: 'Davao City', province_name: 'Davao del Sur', type: 'City' },
  { name: 'Tagum City', province_name: 'Davao del Norte', type: 'City' },
  { name: 'Mati City', province_name: 'Davao Oriental', type: 'City' },
  { name: 'Digos City', province_name: 'Davao del Sur', type: 'City' },
  { name: 'Panabo City', province_name: 'Davao del Norte', type: 'City' },
  { name: 'General Santos City', province_name: 'South Cotabato', type: 'City' },
  { name: 'Koronadal City', province_name: 'South Cotabato', type: 'City' },
  { name: 'Kidapawan City', province_name: 'Cotabato', type: 'City' },
  { name: 'Tacurong City', province_name: 'Sultan Kudarat', type: 'City' },
  { name: 'Alabel', province_name: 'Sarangani', type: 'Municipality' },
  { name: 'Cotabato City', province_name: 'Maguindanao del Norte', type: 'City' },
  { name: 'Butuan City', province_name: 'Agusan del Norte', type: 'City' },
  { name: 'Surigao City', province_name: 'Surigao del Norte', type: 'City' },
  { name: 'Tandag City', province_name: 'Surigao del Sur', type: 'City' },
  { name: 'Bislig City', province_name: 'Surigao del Sur', type: 'City' },
  { name: 'Dinagat', province_name: 'Dinagat Islands', type: 'Municipality' },
  { name: 'Zamboanga City', province_name: 'Zamboanga del Sur', type: 'City' },
  { name: 'Dipolog City', province_name: 'Zamboanga del Norte', type: 'City' },
  { name: 'Pagadian City', province_name: 'Zamboanga del Sur', type: 'City' },
  { name: 'Isabela City', province_name: 'Basilan', type: 'City' },
  { name: 'Jolo', province_name: 'Sulu', type: 'Municipality' },
  { name: 'Bongao', province_name: 'Tawi-Tawi', type: 'Municipality' }
]

const PH_SEED_CITIES = CITY_ROWS.map((row) => {
  const province = provinceByName.get(normalize(row.province_name).toLowerCase()) || null
  const provinceCode = province?.code || `PH-UNK-${slug(row.province_name)}`
  const regionCode = province?.region_code || ''
  const regionName = province?.region_name || ''

  return {
    code: `PH-CITY-${slug(row.name)}-${slug(provinceCode)}`,
    name: normalize(row.name),
    type: normalize(row.type || 'City/Municipality'),
    province_code: provinceCode,
    province_name: normalize(row.province_name),
    region_code: regionCode,
    region_name: regionName
  }
})

const cityByName = new Map(PH_SEED_CITIES.map((city) => [city.name.toLowerCase(), city]))

const PH_SEED_BARANGAYS = {
  'Davao City': [
    'Bago Aplaya', 'Bago Gallera', 'Baliok', 'Buhangin', 'Buhangin Proper', 'Cabantian',
    'Calinan', 'Catalunan Grande', 'Communal', 'Dumoy', 'Indangan', 'Lanang', 'Ma-a',
    'Matina Aplaya', 'Mintal', 'Obrero', 'Panacan', 'Sasa', 'Talomo', 'Toril', 'Ulas', 'Waan'
  ],
  'Quezon City': [
    'Bagumbayan', 'Batasan Hills', 'Commonwealth', 'Culiat', 'Holy Spirit',
    'Novaliches Proper', 'Pasong Tamo', 'Tandang Sora', 'UP Campus'
  ],
  'Cebu City': [
    'Apas', 'Banilad', 'Basak Pardo', 'Capitol Site', 'Guadalupe',
    'Kasambagan', 'Lahug', 'Mabolo', 'Talamban'
  ],
  Taguig: [
    'Bagumbayan', 'Bambang', 'Central Bicutan', 'Fort Bonifacio', 'Lower Bicutan',
    'New Lower Bicutan', 'North Daang Hari', 'Pinagsama', 'Western Bicutan'
  ]
}

const PH_SEED_BARANGAY_ROWS = Object.entries(PH_SEED_BARANGAYS).flatMap(([cityName, names]) => {
  const city = cityByName.get(cityName.toLowerCase()) || null
  const cityCode = city?.code || `PH-CITY-${slug(cityName)}`
  return names.map((name) => ({
    code: `PH-BRGY-${slug(name)}-${slug(cityCode)}`,
    name: normalize(name),
    city_code: cityCode,
    city_name: normalize(cityName),
    province_code: city?.province_code || '',
    province_name: city?.province_name || '',
    region_code: city?.region_code || '',
    region_name: city?.region_name || ''
  }))
})

module.exports = {
  PH_SEED_REGIONS,
  PH_SEED_PROVINCES,
  PH_SEED_CITIES,
  PH_SEED_BARANGAY_ROWS
}
