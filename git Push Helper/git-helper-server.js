const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// Enable CORS for local development
app.use(cors());
app.use(express.json());

// Set working directory to one level up from the tool folder
const projectRoot = path.join(__dirname, '..');

app.post('/git', (req, res) => {
  const { command } = req.body;
  
  if (!command || !command.startsWith('git ')) {
    return res.status(400).json({ error: 'Invalid command. Only git commands are allowed.' });
  }
  
  console.log(`Executing: ${command}`);
  
  exec(command, { cwd: projectRoot }, (error, stdout, stderr) => {
    const output = stdout + stderr;
    
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.json({ 
        error: error.message,
        output: output,
        success: false 
      });
    }
    
    console.log(`Output: ${output}`);
    res.json({ 
      output: output,
      success: true 
    });
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Git helper server is running' });
});

app.get('/workdir', (req, res) => {
  res.json({ path: projectRoot });
});

app.listen(PORT, () => {
  console.log(`🚀 Git Helper Server running on http://localhost:${PORT}`);
  console.log(`📂 Working directory: ${projectRoot}`);
  console.log(`\n💡 Open git-push-tool.html in your browser to use the tool!`);
});
