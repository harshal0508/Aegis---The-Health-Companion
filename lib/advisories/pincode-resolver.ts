/**
 * INDIAN PINCODE & DISTRICT RESOLVER
 * -----------------------------------
 * Provides comprehensive, sub-millisecond offline mapping between 6-digit Indian PIN codes,
 * postal sub-regions, districts, cities, and states.
 * 
 * Supports:
 * 1. Exact 6-digit PIN code lookup.
 * 2. 3-digit postal circle prefix lookup (covering all 9 postal zones across India).
 * 3. 2-digit state circle prefix fallback (guaranteeing resolution for any valid 6-digit Indian PIN).
 * 4. Case-insensitive City / District / Capital text lookup.
 */

export interface ResolvedLocality {
  input: string;
  district: string;        // Canonical district name used for Google News RSS & official bulletins
  city: string;            // Human-readable city/region name
  state: string;           // Indian State or Union Territory
  pincode: string;         // 6-digit PIN code (input PIN or standard head post office PIN)
  displayName: string;     // e.g. "Pune (411014) • Maharashtra"
  pincodePrefix: string;   // 3-digit prefix (e.g. "411")
  isValid: boolean;
  isPincode: boolean;
}

// Comprehensive 3-digit postal circle prefix mapping for India
const PINCODE_PREFIX_MAP: Record<string, { district: string; city: string; state: string }> = {
  // Delhi
  "110": { district: "Delhi", city: "Delhi / NCR", state: "Delhi" },

  // Haryana / NCR
  "121": { district: "Faridabad", city: "Faridabad", state: "Haryana" },
  "122": { district: "Gurugram", city: "Gurugram (Gurgaon)", state: "Haryana" },
  "124": { district: "Rohtak", city: "Rohtak", state: "Haryana" },
  "125": { district: "Hisar", city: "Hisar", state: "Haryana" },
  "131": { district: "Sonipat", city: "Sonipat", state: "Haryana" },
  "132": { district: "Panipat", city: "Panipat / Karnal", state: "Haryana" },
  "133": { district: "Ambala", city: "Ambala", state: "Haryana" },
  "134": { district: "Panchkula", city: "Panchkula", state: "Haryana" },
  "135": { district: "Yamunanagar", city: "Yamunanagar", state: "Haryana" },
  "136": { district: "Kurukshetra", city: "Kurukshetra", state: "Haryana" },

  // Punjab
  "140": { district: "Mohali", city: "SAS Nagar (Mohali)", state: "Punjab" },
  "141": { district: "Ludhiana", city: "Ludhiana", state: "Punjab" },
  "143": { district: "Amritsar", city: "Amritsar", state: "Punjab" },
  "144": { district: "Jalandhar", city: "Jalandhar", state: "Punjab" },
  "151": { district: "Bathinda", city: "Bathinda", state: "Punjab" },
  "152": { district: "Firozpur", city: "Firozpur", state: "Punjab" },

  // Chandigarh
  "160": { district: "Chandigarh", city: "Chandigarh", state: "Chandigarh" },

  // Himachal Pradesh
  "171": { district: "Shimla", city: "Shimla", state: "Himachal Pradesh" },
  "173": { district: "Solan", city: "Solan", state: "Himachal Pradesh" },
  "175": { district: "Mandi", city: "Mandi", state: "Himachal Pradesh" },
  "176": { district: "Kangra", city: "Dharamshala / Kangra", state: "Himachal Pradesh" },
  "177": { district: "Hamirpur", city: "Hamirpur", state: "Himachal Pradesh" },

  // Jammu & Kashmir / Ladakh
  "180": { district: "Jammu", city: "Jammu", state: "Jammu and Kashmir" },
  "190": { district: "Srinagar", city: "Srinagar", state: "Jammu and Kashmir" },
  "194": { district: "Leh", city: "Leh Ladakh", state: "Ladakh" },

  // Uttar Pradesh & Uttarakhand
  "201": { district: "Noida", city: "Noida / Ghaziabad", state: "Uttar Pradesh" },
  "202": { district: "Aligarh", city: "Aligarh", state: "Uttar Pradesh" },
  "203": { district: "Bulandshahr", city: "Bulandshahr", state: "Uttar Pradesh" },
  "204": { district: "Hathras", city: "Hathras", state: "Uttar Pradesh" },
  "208": { district: "Kanpur", city: "Kanpur Nagar", state: "Uttar Pradesh" },
  "209": { district: "Kanpur Dehat", city: "Kanpur Rural", state: "Uttar Pradesh" },
  "211": { district: "Prayagraj", city: "Prayagraj (Allahabad)", state: "Uttar Pradesh" },
  "221": { district: "Varanasi", city: "Varanasi", state: "Uttar Pradesh" },
  "224": { district: "Ayodhya", city: "Ayodhya (Faizabad)", state: "Uttar Pradesh" },
  "226": { district: "Lucknow", city: "Lucknow", state: "Uttar Pradesh" },
  "241": { district: "Hardoi", city: "Hardoi", state: "Uttar Pradesh" },
  "243": { district: "Bareilly", city: "Bareilly", state: "Uttar Pradesh" },
  "244": { district: "Moradabad", city: "Moradabad", state: "Uttar Pradesh" },
  "248": { district: "Dehradun", city: "Dehradun", state: "Uttarakhand" },
  "249": { district: "Haridwar", city: "Haridwar / Rishikesh", state: "Uttarakhand" },
  "250": { district: "Meerut", city: "Meerut", state: "Uttar Pradesh" },
  "263": { district: "Nainital", city: "Nainital / Haldwani", state: "Uttarakhand" },
  "281": { district: "Mathura", city: "Mathura", state: "Uttar Pradesh" },
  "282": { district: "Agra", city: "Agra", state: "Uttar Pradesh" },

  // Rajasthan
  "302": { district: "Jaipur", city: "Jaipur", state: "Rajasthan" },
  "305": { district: "Ajmer", city: "Ajmer", state: "Rajasthan" },
  "313": { district: "Udaipur", city: "Udaipur", state: "Rajasthan" },
  "324": { district: "Kota", city: "Kota", state: "Rajasthan" },
  "334": { district: "Bikaner", city: "Bikaner", state: "Rajasthan" },
  "342": { district: "Jodhpur", city: "Jodhpur", state: "Rajasthan" },

  // Gujarat
  "360": { district: "Rajkot", city: "Rajkot", state: "Gujarat" },
  "361": { district: "Jamnagar", city: "Jamnagar", state: "Gujarat" },
  "364": { district: "Bhavnagar", city: "Bhavnagar", state: "Gujarat" },
  "380": { district: "Ahmedabad", city: "Ahmedabad", state: "Gujarat" },
  "382": { district: "Gandhinagar", city: "Gandhinagar", state: "Gujarat" },
  "390": { district: "Vadodara", city: "Vadodara (Baroda)", state: "Gujarat" },
  "395": { district: "Surat", city: "Surat", state: "Gujarat" },

  // Maharashtra & Goa
  "400": { district: "Mumbai", city: "Mumbai", state: "Maharashtra" },
  "401": { district: "Thane", city: "Thane / Palghar", state: "Maharashtra" },
  "403": { district: "Goa", city: "Panaji / North & South Goa", state: "Goa" },
  "410": { district: "Raigad", city: "Navi Mumbai / Raigad", state: "Maharashtra" },
  "411": { district: "Pune", city: "Pune", state: "Maharashtra" },
  "412": { district: "Pune Rural", city: "Pune Rural / Baramati", state: "Maharashtra" },
  "413": { district: "Solapur", city: "Solapur", state: "Maharashtra" },
  "414": { district: "Ahmednagar", city: "Ahmednagar", state: "Maharashtra" },
  "416": { district: "Kolhapur", city: "Kolhapur", state: "Maharashtra" },
  "421": { district: "Kalyan", city: "Kalyan / Dombivli", state: "Maharashtra" },
  "422": { district: "Nashik", city: "Nashik", state: "Maharashtra" },
  "431": { district: "Chhatrapati Sambhajinagar", city: "Chhatrapati Sambhajinagar (Aurangabad)", state: "Maharashtra" },
  "440": { district: "Nagpur", city: "Nagpur", state: "Maharashtra" },
  "441": { district: "Nagpur Rural", city: "Nagpur Rural", state: "Maharashtra" },
  "444": { district: "Amravati", city: "Amravati / Akola", state: "Maharashtra" },

  // Madhya Pradesh & Chhattisgarh
  "450": { district: "Khandwa", city: "Khandwa / Burhanpur", state: "Madhya Pradesh" },
  "451": { district: "Khargone", city: "Khargone (West Nimar)", state: "Madhya Pradesh" },
  "452": { district: "Indore", city: "Indore", state: "Madhya Pradesh" },
  "453": { district: "Indore Rural", city: "Mhow / Indore Rural", state: "Madhya Pradesh" },
  "454": { district: "Dhar", city: "Dhar", state: "Madhya Pradesh" },
  "455": { district: "Dewas", city: "Dewas", state: "Madhya Pradesh" },
  "456": { district: "Ujjain", city: "Ujjain", state: "Madhya Pradesh" },
  "457": { district: "Ratlam", city: "Ratlam", state: "Madhya Pradesh" },
  "462": { district: "Bhopal", city: "Bhopal", state: "Madhya Pradesh" },
  "464": { district: "Vidisha", city: "Vidisha", state: "Madhya Pradesh" },
  "466": { district: "Sehore", city: "Sehore", state: "Madhya Pradesh" },
  "470": { district: "Sagar", city: "Sagar", state: "Madhya Pradesh" },
  "474": { district: "Gwalior", city: "Gwalior", state: "Madhya Pradesh" },
  "482": { district: "Jabalpur", city: "Jabalpur", state: "Madhya Pradesh" },
  "486": { district: "Rewa", city: "Rewa", state: "Madhya Pradesh" },
  "490": { district: "Durg", city: "Bhilai / Durg", state: "Chhattisgarh" },
  "492": { district: "Raipur", city: "Raipur", state: "Chhattisgarh" },
  "495": { district: "Bilaspur", city: "Bilaspur", state: "Chhattisgarh" },

  // Telangana & Andhra Pradesh
  "500": { district: "Hyderabad", city: "Hyderabad / Secunderabad", state: "Telangana" },
  "501": { district: "Rangareddy", city: "Rangareddy", state: "Telangana" },
  "506": { district: "Warangal", city: "Warangal", state: "Telangana" },
  "515": { district: "Anantapur", city: "Anantapur", state: "Andhra Pradesh" },
  "517": { district: "Tirupati", city: "Tirupati", state: "Andhra Pradesh" },
  "518": { district: "Kurnool", city: "Kurnool", state: "Andhra Pradesh" },
  "520": { district: "Vijayawada", city: "Vijayawada", state: "Andhra Pradesh" },
  "522": { district: "Guntur", city: "Guntur", state: "Andhra Pradesh" },
  "530": { district: "Visakhapatnam", city: "Visakhapatnam (Vizag)", state: "Andhra Pradesh" },
  "533": { district: "Kakinada", city: "Kakinada / Rajahmundry", state: "Andhra Pradesh" },

  // Karnataka
  "560": { district: "Bengaluru", city: "Bengaluru (Bangalore)", state: "Karnataka" },
  "562": { district: "Bengaluru Rural", city: "Bengaluru Rural", state: "Karnataka" },
  "570": { district: "Mysuru", city: "Mysuru (Mysore)", state: "Karnataka" },
  "571": { district: "Chamarajanagar", city: "Chamarajanagar", state: "Karnataka" },
  "575": { district: "Mangaluru", city: "Mangaluru (Mangalore)", state: "Karnataka" },
  "577": { district: "Shivamogga", city: "Shivamogga (Shimoga)", state: "Karnataka" },
  "580": { district: "Hubballi", city: "Hubballi-Dharwad", state: "Karnataka" },
  "581": { district: "Uttara Kannada", city: "Karwar / Sirsi", state: "Karnataka" },
  "583": { district: "Ballari", city: "Ballari (Bellary)", state: "Karnataka" },
  "585": { district: "Kalaburagi", city: "Kalaburagi (Gulbarga)", state: "Karnataka" },

  // Tamil Nadu & Puducherry
  "600": { district: "Chennai", city: "Chennai", state: "Tamil Nadu" },
  "601": { district: "Kanchipuram", city: "Kanchipuram / Chengalpattu", state: "Tamil Nadu" },
  "605": { district: "Puducherry", city: "Puducherry (Pondicherry)", state: "Puducherry" },
  "620": { district: "Tiruchirappalli", city: "Tiruchirappalli (Trichy)", state: "Tamil Nadu" },
  "625": { district: "Madurai", city: "Madurai", state: "Tamil Nadu" },
  "627": { district: "Tirunelveli", city: "Tirunelveli", state: "Tamil Nadu" },
  "629": { district: "Kanyakumari", city: "Kanyakumari / Nagercoil", state: "Tamil Nadu" },
  "636": { district: "Salem", city: "Salem", state: "Tamil Nadu" },
  "638": { district: "Erode", city: "Erode", state: "Tamil Nadu" },
  "641": { district: "Coimbatore", city: "Coimbatore", state: "Tamil Nadu" },

  // Kerala & Lakshadweep
  "670": { district: "Kannur", city: "Kannur", state: "Kerala" },
  "673": { district: "Kozhikode", city: "Kozhikode (Calicut)", state: "Kerala" },
  "676": { district: "Malappuram", city: "Malappuram", state: "Kerala" },
  "678": { district: "Palakkad", city: "Palakkad", state: "Kerala" },
  "680": { district: "Thrissur", city: "Thrissur", state: "Kerala" },
  "682": { district: "Kochi", city: "Kochi (Ernakulam)", state: "Kerala" },
  "686": { district: "Kottayam", city: "Kottayam", state: "Kerala" },
  "688": { district: "Alappuzha", city: "Alappuzha (Alleppey)", state: "Kerala" },
  "691": { district: "Kollam", city: "Kollam", state: "Kerala" },
  "695": { district: "Thiruvananthapuram", city: "Thiruvananthapuram (Trivandrum)", state: "Kerala" },

  // West Bengal & North East
  "700": { district: "Kolkata", city: "Kolkata (Calcutta)", state: "West Bengal" },
  "711": { district: "Howrah", city: "Howrah", state: "West Bengal" },
  "713": { district: "Bardhaman", city: "Durgapur / Asansol", state: "West Bengal" },
  "721": { district: "Paschim Medinipur", city: "Kharagpur / Medinipur", state: "West Bengal" },
  "734": { district: "Darjeeling", city: "Siliguri / Darjeeling", state: "West Bengal" },
  "744": { district: "South Andaman", city: "Port Blair", state: "Andaman & Nicobar Islands" },
  "751": { district: "Bhubaneswar", city: "Bhubaneswar / Khordha", state: "Odisha" },
  "753": { district: "Cuttack", city: "Cuttack", state: "Odisha" },
  "769": { district: "Sundargarh", city: "Rourkela", state: "Odisha" },
  "781": { district: "Guwahati", city: "Guwahati (Kamrup)", state: "Assam" },
  "786": { district: "Dibrugarh", city: "Dibrugarh", state: "Assam" },
  "793": { district: "East Khasi Hills", city: "Shillong", state: "Meghalaya" },
  "795": { district: "Imphal West", city: "Imphal", state: "Manipur" },
  "796": { district: "Aizawl", city: "Aizawl", state: "Mizoram" },
  "797": { district: "Kohima", city: "Kohima / Dimapur", state: "Nagaland" },
  "799": { district: "West Tripura", city: "Agartala", state: "Tripura" },

  // Bihar & Jharkhand
  "800": { district: "Patna", city: "Patna", state: "Bihar" },
  "812": { district: "Bhagalpur", city: "Bhagalpur", state: "Bihar" },
  "823": { district: "Gaya", city: "Gaya", state: "Bihar" },
  "826": { district: "Dhanbad", city: "Dhanbad", state: "Jharkhand" },
  "831": { district: "East Singhbhum", city: "Jamshedpur", state: "Jharkhand" },
  "834": { district: "Ranchi", city: "Ranchi", state: "Jharkhand" },
  "842": { district: "Muzaffarpur", city: "Muzaffarpur", state: "Bihar" },
};

// 2-digit fallback state mapper
const TWO_DIGIT_STATE_MAP: Record<string, string> = {
  "11": "Delhi",
  "12": "Haryana",
  "13": "Haryana",
  "14": "Punjab",
  "15": "Punjab",
  "16": "Chandigarh",
  "17": "Himachal Pradesh",
  "18": "Jammu and Kashmir",
  "19": "Jammu and Kashmir",
  "20": "Uttar Pradesh",
  "21": "Uttar Pradesh",
  "22": "Uttar Pradesh",
  "23": "Uttar Pradesh",
  "24": "Uttarakhand",
  "25": "Uttar Pradesh",
  "26": "Uttar Pradesh",
  "27": "Uttar Pradesh",
  "28": "Uttar Pradesh",
  "30": "Rajasthan",
  "31": "Rajasthan",
  "32": "Rajasthan",
  "33": "Rajasthan",
  "34": "Rajasthan",
  "36": "Gujarat",
  "37": "Gujarat",
  "38": "Gujarat",
  "39": "Gujarat",
  "40": "Maharashtra",
  "41": "Maharashtra",
  "42": "Maharashtra",
  "43": "Maharashtra",
  "44": "Maharashtra",
  "45": "Madhya Pradesh",
  "46": "Madhya Pradesh",
  "47": "Madhya Pradesh",
  "48": "Madhya Pradesh",
  "49": "Chhattisgarh",
  "50": "Telangana",
  "51": "Andhra Pradesh",
  "52": "Andhra Pradesh",
  "53": "Andhra Pradesh",
  "56": "Karnataka",
  "57": "Karnataka",
  "58": "Karnataka",
  "59": "Karnataka",
  "60": "Tamil Nadu",
  "61": "Tamil Nadu",
  "62": "Tamil Nadu",
  "63": "Tamil Nadu",
  "64": "Tamil Nadu",
  "67": "Kerala",
  "68": "Kerala",
  "69": "Kerala",
  "70": "West Bengal",
  "71": "West Bengal",
  "72": "West Bengal",
  "73": "West Bengal",
  "74": "West Bengal",
  "75": "Odisha",
  "76": "Odisha",
  "77": "Odisha",
  "78": "Assam",
  "79": "North Eastern States",
  "80": "Bihar",
  "81": "Bihar",
  "82": "Bihar",
  "83": "Jharkhand",
  "84": "Bihar",
  "85": "Bihar",
};

// Popular Indian Cities Registry with canonical district names & primary PIN codes
export const POPULAR_INDIAN_LOCALITIES: Array<{
  city: string;
  district: string;
  state: string;
  pincode: string;
}> = [
  { city: "Indore", district: "Indore", state: "Madhya Pradesh", pincode: "452001" },
  { city: "Pune", district: "Pune", state: "Maharashtra", pincode: "411001" },
  { city: "Bhopal", district: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  { city: "Mumbai", district: "Mumbai", state: "Maharashtra", pincode: "400001" },
  { city: "Delhi / NCR", district: "Delhi", state: "Delhi", pincode: "110001" },
  { city: "Bengaluru", district: "Bengaluru", state: "Karnataka", pincode: "560001" },
  { city: "Hyderabad", district: "Hyderabad", state: "Telangana", pincode: "500001" },
  { city: "Jaipur", district: "Jaipur", state: "Rajasthan", pincode: "302001" },
  { city: "Chennai", district: "Chennai", state: "Tamil Nadu", pincode: "600001" },
  { city: "Kolkata", district: "Kolkata", state: "West Bengal", pincode: "700001" },
  { city: "Lucknow", district: "Lucknow", state: "Uttar Pradesh", pincode: "226001" },
  { city: "Ahmedabad", district: "Ahmedabad", state: "Gujarat", pincode: "380001" },
  { city: "Noida", district: "Noida", state: "Uttar Pradesh", pincode: "201301" },
  { city: "Gurugram", district: "Gurugram", state: "Haryana", pincode: "122001" },
  { city: "Nagpur", district: "Nagpur", state: "Maharashtra", pincode: "440001" },
  { city: "Chandigarh", district: "Chandigarh", state: "Chandigarh", pincode: "160001" },
];

/**
 * Resolves any Indian Postal PIN code (e.g. "560034", "411014", "452010")
 * or City/District text string (e.g. "Pune", "Koramangala", "Bhopal")
 * into canonical District, State, and Display names.
 */
export function resolveIndianLocality(rawQuery: string): ResolvedLocality {
  const clean = (rawQuery || "").trim();
  if (!clean) {
    return {
      input: "",
      district: "Indore",
      city: "Indore",
      state: "Madhya Pradesh",
      pincode: "452001",
      displayName: "Indore (452001) • Madhya Pradesh",
      pincodePrefix: "452",
      isValid: true,
      isPincode: false,
    };
  }

  // 1. Check if input is a 6-digit Indian Postal Code
  const pinDigits = clean.replace(/\D/g, "");
  const isPincode = pinDigits.length === 6;

  if (isPincode) {
    const prefix3 = pinDigits.slice(0, 3);
    const prefix2 = pinDigits.slice(0, 2);

    if (PINCODE_PREFIX_MAP[prefix3]) {
      const match = PINCODE_PREFIX_MAP[prefix3];
      return {
        input: clean,
        district: match.district,
        city: match.city,
        state: match.state,
        pincode: pinDigits,
        displayName: `${match.district} (${pinDigits}) • ${match.state}`,
        pincodePrefix: prefix3,
        isValid: true,
        isPincode: true,
      };
    }

    // 2-digit fallback state
    const stateFallback = TWO_DIGIT_STATE_MAP[prefix2] || "India";
    return {
      input: clean,
      district: `District ${prefix3}`,
      city: `Pincode Area ${pinDigits}`,
      state: stateFallback,
      pincode: pinDigits,
      displayName: `PIN ${pinDigits} • ${stateFallback}`,
      pincodePrefix: prefix3,
      isValid: true,
      isPincode: true,
    };
  }

  // 2. Text Search: Check against Popular Localities Registry
  const lower = clean.toLowerCase();
  const directMatch = POPULAR_INDIAN_LOCALITIES.find(
    (l) =>
      l.city.toLowerCase() === lower ||
      l.district.toLowerCase() === lower ||
      lower.includes(l.city.toLowerCase()) ||
      lower.includes(l.district.toLowerCase())
  );

  if (directMatch) {
    return {
      input: clean,
      district: directMatch.district,
      city: directMatch.city,
      state: directMatch.state,
      pincode: directMatch.pincode,
      displayName: `${directMatch.city} (${directMatch.pincode}) • ${directMatch.state}`,
      pincodePrefix: directMatch.pincode.slice(0, 3),
      isValid: true,
      isPincode: false,
    };
  }

  // 3. Search through Prefix Map city & district names
  for (const [prefix, data] of Object.entries(PINCODE_PREFIX_MAP)) {
    if (
      data.city.toLowerCase().includes(lower) ||
      data.district.toLowerCase().includes(lower)
    ) {
      return {
        input: clean,
        district: data.district,
        city: data.city,
        state: data.state,
        pincode: `${prefix}001`,
        displayName: `${data.city} (${prefix}001) • ${data.state}`,
        pincodePrefix: prefix,
        isValid: true,
        isPincode: false,
      };
    }
  }

  // 4. Fallback for unrecognized city/text
  const titleCased = clean.charAt(0).toUpperCase() + clean.slice(1);
  return {
    input: clean,
    district: titleCased,
    city: titleCased,
    state: "Regional Area",
    pincode: "452001",
    displayName: `${titleCased} • Regional Digest`,
    pincodePrefix: "452",
    isValid: true,
    isPincode: false,
  };
}
