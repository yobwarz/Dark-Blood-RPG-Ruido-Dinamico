// Extensão local: não altera DialogV2 nem os formulários de outros módulos.
export function waitForm(config){
 class ValidatedFormDialog extends foundry.applications.api.DialogV2{
  async _onSubmit(target,event){
   event?.preventDefault?.();
   if(this._savingForm)return this;
   const form=target?.form??this.element?.querySelector('form');
   if(target?.dataset?.action!=='cancel'&&form?.reportValidity?.()===false)return this;
   const output=this.element?.querySelector('[data-form-error]');
   if(output)output.textContent='';
   const buttons=Array.from(this.element?.querySelectorAll('button[data-action]')??[]).map(button=>[button,button.disabled]);
   this._savingForm=true;
   try{return await super._onSubmit(target,event);}
   catch(error){
    const message=error?.message??String(error);
    if(output){output.textContent=message;output.focus?.();}
    else ui.notifications.warn(message);
    return this;
   }finally{
    this._savingForm=false;
    for(const [button,disabled] of buttons)if(button.isConnected)button.disabled=disabled;
   }
  }
 }
 return ValidatedFormDialog.wait(config);
}
