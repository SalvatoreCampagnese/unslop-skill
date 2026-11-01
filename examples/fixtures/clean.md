# Why we moved the invoices off Stripe Billing

We switched in March. The reason was boring: Stripe Billing rounds VAT per line item, and the Italian accountant we use wants it rounded per invoice. Two cents of difference, every month, on about 400 invoices. Our bookkeeper caught it in February and spent a day reconciling by hand.

I tried three fixes before giving up. Tax rate overrides don't apply retroactively. A custom tax calculator needs the Tax API, which we don't pay for. And the webhook approach meant rewriting the invoice after Stripe had already finalised it, which Stripe sensibly refuses to do.

So now we generate the PDF ourselves and keep Stripe for the card charge only. It took four days. The code is ugly in one place: the invoice number has to be reserved before the charge succeeds, or you get gaps. But the accountant stopped emailing me, which was the point.

Would I do it again? Probably not for 400 invoices. Ask me again at 4,000.
