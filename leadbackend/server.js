require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const GRAPH = 'https://graph.facebook.com/v21.0';
const PAGE_ID = process.env.PAGE_ID;
const TOKEN = process.env.PAGE_ACCESS_TOKEN;

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const leads = []; // newest first

// When the app connects, send everything we have
io.on('connection', (socket) => {
  console.log('App connected');
  socket.emit('leads:init', leads);
});


// Turn Meta's lead into a simple object and store it
function addLead(raw, source = 'webhook', silent = false) {
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
    console.log(`New lead (${source}):`, lead.full_name || lead.id);
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

      for (const raw of result.data || []) addLead(raw, 'polling', silent);
    }

    if (silent) {
      io.emit('leads:init', leads);
      console.log('Loaded existing leads:', leads.length);
    }
  } catch (err) {
    console.error('Sync failed:', err.message);
  }
}

// Tell Meta to send webhooks for this page
async function subscribePage() {
  try {
    const url = `${GRAPH}/${PAGE_ID}/subscribed_apps?subscribed_fields=leadgen&access_token=${TOKEN}`;
    const res = await fetch(url, { method: 'POST' });
    console.log('Subscribe result:', await res.json());
  } catch (err) {
    console.error('Subscribe failed:', err.message);
  }
}


// Meta checks the webhook URL here
app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === process.env.VERIFY_TOKEN
  ) {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// Meta calls this when someone submits the form
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  for (const entry of req.body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen') continue;

      const leadId = change.value.leadgen_id;
      console.log('Webhook received:', leadId);

      try {
        const response = await fetch(`${GRAPH}/${leadId}?access_token=${TOKEN}`);
        const data = await response.json();

        if (data.error) {
          console.error('Graph error:', data.error.message);
          continue;
        }

        addLead(data);
      } catch (err) {
        console.error('Webhook failed:', err.message);
      }
    }
  }
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, async () => {
  console.log('Running on', PORT);
  await subscribePage();       // so Meta sends webhooks
  await syncLeads();           // load leads that already exist
  setInterval(syncLeads, 10000); // backup: check every 10 seconds
});