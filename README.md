# Caspra Labs — Navigation Page

Página de navegação estática do portfólio Caspra Labs.

## Arquivos

```
caspra-nav/
├── index.html    — estrutura da página
├── style.css     — estilos, paleta, animações CSS
├── script.js     — starfield canvas + parallax + interações
└── README.md     — este arquivo
```

## Deploy

### Netlify (drag & drop)
1. Acesse [app.netlify.com](https://app.netlify.com)
2. Arraste a pasta `caspra-nav/` para a área de deploy
3. Pronto — URL gerada automaticamente

### GitHub Pages
1. Faça upload dos arquivos para um repositório público
2. Em Settings → Pages, selecione a branch principal como source
3. A página ficará disponível em `https://<usuario>.github.io/<repo>/`

### Vercel
1. Instale a CLI: `npm i -g vercel`
2. Dentro da pasta: `vercel --prod`

### Servidor estático simples / Bring IT
1. Faça upload de todos os arquivos via FTP/SFTP para o diretório público do servidor
2. Aponte o domínio para `index.html`

## Substituir URLs dos produtos

Abra `index.html` e localize os atributos `data-href` nos três elementos `.product`:

```html
<div class="product aurelia" data-href="#aurelia" ...>
<div class="product latamtax" data-href="#latamtax" ...>
<div class="product hc360" data-href="#hc360" ...>
```

Substitua `#aurelia`, `#latamtax`, `#hc360` pelas URLs reais de cada produto.

## Compatibilidade

- Chrome e Safari modernos (desktop e mobile)
- Responsivo: mobile empilha os produtos verticalmente
- Acessível: navegação por teclado, respeita `prefers-reduced-motion`
- Sem dependências de backend ou build system
- Fonte carregada via Google Fonts (requer conexão na primeira carga)

---
Briefing: Oidux / Gabriel — v1.0 — junho 2026
