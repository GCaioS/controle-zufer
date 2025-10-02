require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const open = require('open').default;
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const { TRELLO_KEY, TRELLO_TOKEN, PORT } = process.env;

app.get('/cards/:boardId', async (req, res) => {
  const boardId = req.params.boardId;
  if (!boardId) return res.status(400).json({ error: 'Board ID não informado' });

  try {
    const listsRes = await axios.get(`https://api.trello.com/1/boards/${boardId}/lists`, {
      params: { key: TRELLO_KEY, token: TRELLO_TOKEN, fields: 'name', filter: 'open' }
    });

    const lists = listsRes.data.filter(list => !['Hidratação', 'Interrompidas', 'Concluído'].includes(list.name));
    const listMap = {};
    lists.forEach(list => listMap[list.id] = list.name);

    const cardsRes = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: {
        key: TRELLO_KEY,
        token: TRELLO_TOKEN,
        fields: 'name,desc,shortUrl,labels,idList,start,due',
        customFieldItems: 'true'
      }
    });

    const customFieldsRes = await axios.get(`https://api.trello.com/1/boards/${boardId}/customFields`, {
      params: { key: TRELLO_KEY, token: TRELLO_TOKEN }
    });

    const customFieldsDefs = customFieldsRes.data;

    const cards = cardsRes.data
      .map(card => {
        let customFields = {};
        // Preenche todos os campos personalizados, mesmo que estejam vazios
        customFieldsDefs.forEach(def => {
          let value = null;
          const item = Array.isArray(card.customFieldItems)
            ? card.customFieldItems.find(i => i.idCustomField === def.id)
            : null;
          if (item) {
            if (item.value) {
              if (item.value.text) value = item.value.text;
              else if (item.value.number) value = item.value.number;
              else if (item.value.checked) value = item.value.checked;
              else value = JSON.stringify(item.value);
            } else if (item.idValue && def.options) {
              const opt = def.options.find(o => o.id === item.idValue);
              value = opt ? opt.value.text : item.idValue;
            }
          }
          customFields[def.name] = value !== null && value !== undefined && value !== '' ? value : 'N/A';
        });

        if ('produção' in customFields) delete customFields['produção'];

        return {
          ...card,
          listName: listMap[card.idList] || 'Sem lista',
          customFields,
          startDate: card.start,
          dueDate: card.due
        };
      })
      .filter(card => !['Sem lista', 'Hidratação', 'Interrompidas', 'Concluído'].includes(card.listName));

    res.json(cards);

  } catch (err) {
    console.error('Erro ao buscar cards:', err.message);
    res.status(err.response?.status || 500).json({ error: 'Erro ao buscar cards do Trello' });
  }
});

// Endpoint para atualizar campo personalizado do Trello
app.post('/update-custom-field', async (req, res) => {
  const { cardId, fieldId, value } = req.body;
  if (!cardId || !fieldId) return res.status(400).json({ error: 'Dados insuficientes' });

  try {
    // Buscar o boardId do cartão
    const cardRes = await axios.get(`https://api.trello.com/1/cards/${cardId}`, {
      params: { key: TRELLO_KEY, token: TRELLO_TOKEN, fields: 'idBoard' }
    });
    const boardId = cardRes.data.idBoard;

    // Buscar definição do campo personalizado
    const customFieldsRes = await axios.get(`https://api.trello.com/1/boards/${boardId}/customFields`, {
      params: { key: TRELLO_KEY, token: TRELLO_TOKEN }
    });
    const customField = customFieldsRes.data.find(f => f.id === fieldId);
    if (!customField) return res.status(404).json({ error: 'Campo personalizado não encontrado' });

    // Monta o body correto conforme o tipo
    let body = {};
    switch (customField.type) {
      case 'text':
        body = { value: { text: String(value) } };
        break;
      case 'number':
        body = { value: { number: String(value) } };
        break;
      case 'date':
        body = { value: { date: String(value) } };
        break;
      case 'checkbox':
        body = { value: { checked: value === true || value === 'true' ? 'true' : 'false' } };
        break;
      case 'list':
        // value deve ser o idValue da opção
        body = { idValue: value };
        break;
      default:
        return res.status(400).json({ error: 'Tipo de campo não suportado: ' + customField.type });
    }

    await axios.put(
      `https://api.trello.com/1/cards/${cardId}/customField/${fieldId}/item`,
      body,
      { params: { key: TRELLO_KEY, token: TRELLO_TOKEN } }
    );
    res.json({ message: 'Campo atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar campo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  // Abre o navegador no Windows
  if (process.platform === 'win32') {
    exec(`start http://localhost:${PORT}`);
  } else if (process.platform === 'darwin') {
    exec(`open http://localhost:${PORT}`);
  } else {
    exec(`xdg-open http://localhost:${PORT}`);
  }
});