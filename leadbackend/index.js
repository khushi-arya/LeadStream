require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');


const FB_API = 'https://graph.facebook.com/v21.0';
const PAGE_ID = process.env.PAGE_ID;
const TOKEN = process.env.PAGE_ACCESS_TOKEN;


const server = http.createServer();
const io = new Server(server, { 
  cors: { origin: '*' } 
});


let leadCache = [];          
const seenIds = new Set();   


io.on('connection', (socket) => { //runs whenever client connects.
  console.log(`Client connected: ${socket.id}`);
  socket.emit('leads:init', leadCache);
});

 //processAndStoreLead:- it takes one raw lead object from Facebook and process it.
function processAndStoreLead(rawLead, isSilent = false) {
  if (!rawLead || !rawLead.id) return;
  if (seenIds.has(rawLead.id)) return; 
  seenIds.add(rawLead.id);

  if (isSilent) return;

  const parsedLead = {
    id: rawLead.id,
    created_time: rawLead.created_time
  };

  if (rawLead.field_data) {
    for (const field of rawLead.field_data) {
      if (field.name && field.values?.[0]) {
        parsedLead[field.name] = field.values[0];
      }
    }
  }

  leadCache.unshift(parsedLead); 
  io.emit('lead:new', parsedLead);
  console.log(`New lead captured: ${parsedLead.full_name || parsedLead.id}`);
}

// It  get data from the facebook meta testtool
async function fetchLeadsFromMeta(isSilent = false) {
  try {   
    const formRes = await fetch(`${FB_API}/${PAGE_ID}/leadgen_forms?access_token=${TOKEN}`);
    const formData = await formRes.json();
    if (formData.error) {
      console.error('Oof, FB form error:', formData.error.message);
      return;
    }

    const forms = formData.data || [];
    for (const form of forms) {
      const leadRes = await fetch(`${FB_API}/${form.id}/leads?limit=100&access_token=${TOKEN}`);
      const leadResult = await leadRes.json();
      if (leadResult.error) {
        console.error(`Failed to fetch leads for form ${form.id}:`, leadResult.error.message);
        continue;
      }
      const rawLeads = leadResult.data || [];
      for (const raw of rawLeads) {
        processAndStoreLead(raw, isSilent);//send each raw lead to processAndStoreLead
      }
    }

  } catch (err) {
    console.error('Network error while syncing leads from Meta:', err.message);
  }
}

const PORT = process.env.PORT || 8080;
//Starts the server
server.listen(PORT, async () => {
  console.log(`Lead server up and running on port ${PORT}`);  
  await fetchLeadsFromMeta(true);  
  setInterval(() => {
    fetchLeadsFromMeta(false);
  }, 10000);
});
