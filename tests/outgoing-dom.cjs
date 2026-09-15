// Structured fields from the real command-row supplied in the bug report.
exports.row = ({id='1874818544',source='9',target='501|501',type='attack'}={}) => ({
 querySelector(selector){
  if(selector==='.quickedit-out[data-id]')return {dataset:{id:String(id)}};
  if(selector==='.command-cancel[data-id][data-home]')return {dataset:{id:String(id),home:String(source)}};
  if(selector==='.command_hover_details[data-command-id][data-command-type]')return {dataset:{commandId:String(id),commandType:type}};
  if(selector==='a[href*="screen=info_command"]')return {href:`https://test/game.php?village=${source}&screen=info_command&id=${id}&type=own`};
  if(selector==='.quickedit-label')return {textContent:target?`Attack to 001 (${target}) K36`:''};
  return null;
 }
});
