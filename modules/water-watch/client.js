const query = document.querySelector('#query');
const category = document.querySelector('#category');
const source = document.querySelector('#source');
const stories = [...document.querySelectorAll('.story')];

function update() {
  const term = query.value.trim().toLowerCase();
  let count = 0;
  for (const story of stories) {
    story.hidden = !((!category.value || story.dataset.category === category.value) && (!source.value || story.dataset.source === source.value) && (!term || story.dataset.search.includes(term)));
    if (!story.hidden) count++;
  }
  document.querySelector('#count').textContent = `${count} 条`;
  document.querySelector('#empty').hidden = count !== 0;
}

query.addEventListener('input', update);
category.addEventListener('change', update);
source.addEventListener('change', update);
document.querySelector('#reset').addEventListener('click', () => {
  query.value = category.value = source.value = '';
  update();
  query.focus();
});

// A static preview can stay open for days; expose age without claiming a fresh forecast.
for (const label of document.querySelectorAll('[data-snapshot-at]')) {
  const fetched = Date.parse(label.dataset.snapshotAt);
  if (Number.isFinite(fetched) && Date.now() - fetched > 24 * 60 * 60 * 1000) {
    label.textContent += ' · 快照已超过 24 小时，请核对官网';
    label.classList.add('data-caution');
  }
}
