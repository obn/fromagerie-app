/**
 * Middlewares Express pour proteger les routes API.
 *
 * - requireAuth  : verifie qu'un token JWT valide est fourni (n'importe quel role)
 * - requireRole  : en plus de requireAuth, verifie que le role de l'utilisateur
 *                  fait partie de la liste autorisee pour cette route
 */

const { verifierToken } = require('./jwt');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  try {
    req.user = verifierToken(token); // { id, email, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée, merci de vous reconnecter' });
  }
}

function requireRole(...rolesAutorises) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!rolesAutorises.includes(req.user.role)) {
        return res.status(403).json({ error: 'Accès refusé — droits insuffisants pour cette action' });
      }
      next();
    });
  };
}

module.exports = { requireAuth, requireRole };
