require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const GRAPH = 'https://graph.facebook.com/v21.0';
const PAGE_ID = process.env.PAGE_ID;
const TOKEN = process.env.PAGE_ACCESS_TOKEN;

const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

const leads = []; // newest first

// When the app connects, send everything we have
io.on('connection', (socket) => {
  console.log('App connected');
  socket.emit('leads:init', leads);
});

// Turn Meta's lead into a simple object and store it
function addLead(raw, silent = false) {
  if (!raw || !raw.id) return;
  if (leads.some((l) => l.id === raw.id)) return;

  const lead = { id: raw.id, created_time: raw.created_time };

  for (const field of raw.field_data || []) {
    if (field.name && field.values && field.values.length > 0) {
      lead[field.name] = field.values[0];
    }
  }

  leads.push(lead);
  leads.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));

  if (!silent) {
    io.emit('lead:new', lead);
    console.log('New lead:', lead.full_name || lead.id);
  }
}

// Ask Meta for all leads of all forms
async function syncLeads(silent = false) {
  try {
    const formsRes = await fetch(`${GRAPH}/${PAGE_ID}/leadgen_forms?access_token=${TOKEN}`);
    const forms = await formsRes.json();

    if (forms.error) {
      console.error('Forms error:', forms.error.message);
      return;
    }

    for (const form of forms.data || []) {
      const leadsRes = await fetch(`${GRAPH}/${form.id}/leads?limit=100&access_token=${TOKEN}`);
      const result = await leadsRes.json();

      if (result.error) {
        console.error('Leads error:', result.error.message);
        continue;
      }

      for (const raw of result.data || []) addLead(raw, silent);
    }

  } catch (err) {
    console.error('Sync failed:', err.message);
  }
}

const PORT = process.env.PORT || 8080;

server.listen(PORT, async () => {
  console.log('Running on', PORT);
  await syncLeads(true);                 // quiet initial load
  setInterval(() => syncLeads(), 10000); // poll every 10 seconds
});