const express = require("express");
const multer = require("multer");
const fs = require("fs");
const pdf = require("pdf-parse");
const ExcelJS = require("exceljs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.static("."));

const extractData = (text) => {
  const lines = text.split("\n");
  const entries = [];
  let currentPos = null;
  let currentDesc = "";
  let lastDeliveryDate = "";
  let partials = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^\d{5}\s+/.test(line)) continue;

    const deliveryMatch = line.match(/Delivery date.*?(\d{2}\.\d{2}\.\d{4})/);
    if (deliveryMatch) {
      lastDeliveryDate = deliveryMatch[1];
    }

    const posMatch = line.match(/^(\d{3,4})([A-Z\s\-0-9\(\)\"\/.,]+)$/i);
    if (posMatch && !line.includes("Delivery")) {
      currentPos = posMatch[1].trim();
      currentDesc = posMatch[2].trim().replace(/\s+/g, " ");
      continue;
    }

    const fullMatch = line.match(
      /(\d{1,3},\d{2})\s*PC\s*(\d{1,3},\d{2})\s*EUR\/PC\s*(\d{1,6},\d{2})/
    );
    if (fullMatch && currentPos) {
      entries.push({
        Pos: currentPos,
        Description: currentDesc,
        Quantity: fullMatch[1].replace(",", "."),
        UnitPrice: fullMatch[2].replace(",", "."),
        TotalPrice: fullMatch[3].replace(",", "."),
        DeliveryDate: lastDeliveryDate,
      });
    }

    /* const partialMatch = line.match(
      /Partial quant\s+(\d{1,3},\d{2})\s*PC\s*(\d{1,3},\d{2})EUR\/PC\s*(\d{1,6},\d{2})/i
    );
    if (partialMatch && currentPos) {
      entries.push({
        Pos: currentPos,
        Description: currentDesc,
        Quantity: partialMatch[1].replace(",", "."),
        UnitPrice: partialMatch[2].replace(",", "."),
        TotalPrice: partialMatch[3].replace(",", "."),
        DeliveryDate: lastDeliveryDate,
      });
    } */
  }

  return entries;
};

app.post("/upload", upload.single("pdf"), async (req, res) => {
  const dataBuffer = fs.readFileSync(req.file.path);
  const data = await pdf(dataBuffer);
  fs.unlinkSync(req.file.path);

  const lines = data.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const items = [];
  let currentItem = {};
  let capture = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Log di debug
    console.log(`LINE ${i}: ${line}`);

    // Cerca inizio posizione
    const posMatch = line.match(/^(\d{2,4})\s+([A-Z].*)/);
    if (posMatch) {
      if (currentItem.pos) items.push(currentItem); // salva quello precedente
      currentItem = {
        pos: posMatch[1],
        description: posMatch[2],
        orderCode: "",
        quantity: "",
        price: "",
        deliveryDate: "",
      };
      capture = true;
      continue;
    }

    if (!capture) continue;

    // Cerca Order Code
    const orderMatch = line.match(/Order Code:\s+([\w-]+)/);
    if (orderMatch) {
      currentItem.orderCode = orderMatch[1];
      continue;
    }

    // Cerca quantità e prezzo
    const qtyPriceMatch = line.match(/([\d,]+)\s+PC\s+([\d,]+)\s+EUR\/PC/);
    if (qtyPriceMatch) {
      currentItem.quantity = qtyPriceMatch[1];
      currentItem.price = qtyPriceMatch[2];
      continue;
    }

    // Cerca data consegna
    const deliveryMatch = line.match(
      /Delivery date .*?:\s+(\d{2}\.\d{2}\.\d{4})/
    );
    if (deliveryMatch) {
      currentItem.deliveryDate = deliveryMatch[1];
      continue;
    }
  }

  if (currentItem.pos) items.push(currentItem); // salva ultimo

  console.log(
    "📄 Posizioni estratte:",
    items.map((i) => i.pos)
  );
  res.json(items);
});

app.listen(3000, () => {
  console.log("✅ FIXED server running at http://localhost:3000");
});
