document.querySelector('.menu-toggle').addEventListener('click',()=>{
  const nav=document.querySelector('.nav-links'); nav.style.display = nav.style.display==='flex'?'none':'flex';
});
document.getElementById('year').textContent = new Date().getFullYear();

// Basic contact form handler (static): opens mail client as a fallback.
document.getElementById('contactForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const data = new FormData(e.target);
  const name = data.get('name');
  const email = data.get('email');
  const phone = data.get('phone') || '';
  const msg = data.get('message');
  const subject = encodeURIComponent('Trial class enquiry');
  const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${msg}`);
  const mailto = `mailto:info@irontiger.co.za?subject=${subject}&body=${body}`;
  document.getElementById('formStatus').textContent = 'Opening your email app…';
  window.location.href = mailto;
});
