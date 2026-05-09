#!/usr/bin/env node
/**
 * Generate PNG icons from SVG
 * Run this script to create icon.png and tray-icon.png
 * 
 * Prerequisites: npm install sharp
 * 
 * Usage: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

async function generateIcons() {
  const svgPath = join(rootDir, 'build', 'icon.svg');
  const svgBuffer = readFileSync(svgPath);

  // Generate main icon (512x512 for high quality)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(rootDir, 'build', 'icon.png'));
  
  console.log('✅ Generated build/icon.png (512x512)');

  // Generate tray icon (22x22 for macOS menu bar, 32x32 for Windows)
  await sharp(svgBuffer)
    .resize(22, 22)
    .png()
    .toFile(join(rootDir, 'build', 'tray-icon.png'));
  
  console.log('✅ Generated build/tray-icon.png (22x22)');

  // Generate tray template icon for macOS (monochrome)
  await sharp(svgBuffer)
    .resize(22, 22)
    .grayscale()
    .threshold(128)
    .png()
    .toFile(join(rootDir, 'build', 'trayTemplate.png'));
  
  console.log('✅ Generated build/trayTemplate.png (22x22, monochrome)');
}

generateIcons().catch(console.error);
