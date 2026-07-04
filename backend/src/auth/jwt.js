/**
 * Signature et verification des tokens JWT pour l'authentification.
 *
 * JWT_SECRET doit etre defini dans .env (Railway et local) — une chaine
 * longue et aleatoire, jamais commitee. Sans elle, le serveur refuse de
 * demarrer les routes protegees (voir middleware.js).
 */

const jwt = require('jsonwebtoken');

const DUREE_TOKEN = '12h'; // duree de validite d'une session

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET manquant dans .env — obligatoire pour l\'authentification');
  }
  return secret;
}

function signerToken(utilisateur) {
  return jwt.sign(
    { id: utilisateur.id, email: utilisateur.email, role: utilisateur.role },
    getSecret(),
    { expiresIn: DUREE_TOKEN }
  );
}

function verifierToken(token) {
  return jwt.verify(token, getSecret()); // leve une exception si invalide/expire
}

module.exports = { signerToken, verifierToken };
