const express = require("express");
const multer = require("multer");
const fs = require("fs");
const pdf = require("pdf-parse");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.static("."));

app.post("/upload", upload.single("pdf"), async (req, res) => {
  const dataBuffer = fs.readFileSync(req.file.path);
  const data = await pdf(dataBuffer);
  fs.unlinkSync(req.file.path); // elimina il file dopo la lettura

  const lines = data.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const items = [];
  let currentItem = null;

  let bufferDesc = [];
  const seenPositions = new Set();
  const allowed = /^(T-PIECE|TUBE|ELBOW|REDUCER|COAX)/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Gestisce il caso in cui il numero di posizione sia su una
    // riga separata dalla descrizione (es. "1600" a capo)
    if (/^\d{3,4}$/.test(line) && i + 1 < lines.length) {
      line = line + " " + lines[++i];
    }

    // Inizio nuova posizione
    // Rileva posizioni (multipli di 100 con 3 o 4 cifre)
    const posMatch = line.match(/^([1-9]\d?00)(.*)/);
    console.log("posMatch", posMatch);
    //console.log("Post Match", posMatch);
    if (posMatch) {
      const restOfLine = posMatch[2] ? posMatch[2].trim() : "";
      if (!allowed.test(restOfLine)) {
        continue; // non è una posizione valida
      }
      const posNumber = posMatch[1];
      if (seenPositions.has(posNumber)) {
        continue; // ignora posizioni duplicate
      }
      seenPositions.add(posNumber);

      // Salva il precedente
      if (currentItem && currentItem.deliveryDate && currentItem.quantity) {
        currentItem.description = bufferDesc.join(" ").replace(/\s+/g, " ");
        items.push(currentItem);
      }

      currentItem = {
        pos: posNumber,
        description: restOfLine,
        orderCode: "",
        quantity: "",
        unitPrice: "",
        total: "",
        deliveryDate: "",
      };
      bufferDesc = [restOfLine];
      continue;
    }

    // Aggiunta alla descrizione se ancora in corso
    if (
      currentItem &&
      !line.startsWith("Order Code:") &&
      !line.includes("PC") &&
      !line.includes("EUR/PC") &&
      !line.includes("Delivery date")
    ) {
      bufferDesc.push(line);
    }

    // Order Code
    const orderMatch = line.match(/Order Code:\s+([\w-]+)/);
    if (orderMatch && currentItem) {
      currentItem.orderCode = orderMatch[1];
      continue;
    }

    // Quantità, Prezzo, Totale
    const qtyPriceMatch = line.match(
      /(\d{1,3},\d{2})\s+PC\s+(\d{1,3},\d{2})\s+EUR\/PC\s+(\d{1,6},\d{2})/
    );
    if (qtyPriceMatch && currentItem) {
      currentItem.quantity = qtyPriceMatch[1].replace(",", ".");
      currentItem.unitPrice = qtyPriceMatch[2].replace(",", ".");
      currentItem.total = qtyPriceMatch[3].replace(",", ".");
      continue;
    }

    // Delivery date
    const deliveryMatch = line.match(
      /Delivery date.*?:\s*(\d{2}\.\d{2}\.\d{4})/
    );
    if (deliveryMatch && currentItem) {
      currentItem.deliveryDate = deliveryMatch[1];
      continue;
    }
  }

  // Ultimo elemento
  if (currentItem && currentItem.deliveryDate && currentItem.quantity) {
    currentItem.description = bufferDesc.join(" ").replace(/\s+/g, " ");
    items.push(currentItem);
  }

  // Rimuove eventuali duplicati mantenendo la prima occorrenza
  const uniqueItems = [];
  const seenPos = new Set();
  for (const item of items) {
    if (!seenPos.has(item.pos)) {
      uniqueItems.push(item);
      seenPos.add(item.pos);
    }
  }

  res.json(uniqueItems);
});

app.listen(3000, () => {
  console.log("✅ Server attivo su http://localhost:3000");
});
